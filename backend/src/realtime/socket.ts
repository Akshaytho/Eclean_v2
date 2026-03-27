// eClean — Socket.io realtime server
// Auth on connect via JWT handshake, user rooms, task rooms, GPS relay

import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import type { Server as HttpServer } from 'http'
import type { Role } from '@prisma/client'
import { verifyToken } from '../lib/jwt'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { env } from '../config/env'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocketUser {
  id:    string
  role:  Role
  email: string
}

// Module-level singleton — undefined until initSocket() is called.
// All emit helpers guard with io?. so they're safe to import anywhere.
export let io: Server | undefined

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin:      env.CORS_ORIGINS.split(','),
      credentials: true,
    },
  })

  // Redis adapter — enables Socket.io across multiple Railway instances
  const pubClient = redis.duplicate()
  io.adapter(createAdapter(redis, pubClient))

  // ── JWT auth middleware ──────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('Authentication required'))

    try {
      const payload = verifyToken(token, 'access')

      const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`)
      if (isBlacklisted) return next(new Error('Token revoked'))

      socket.data.user = {
        id:    payload.sub,
        role:  payload.role,
        email: payload.email,
      } as SocketUser

      next()
    } catch {
      next(new Error('Invalid or expired token'))
    }
  })

  // ── Connection ───────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser
    logger.info({ userId: user.id, socketId: socket.id }, 'Socket connected')

    // Every user gets their own personal room for targeted notifications
    void socket.join(`user:${user.id}`)

    // ── join_task_room ───────────────────────────────────────────────────────
    // Client sends { taskId } — server joins the socket to task:{taskId} room
    // only if the user is the buyer OR the assigned worker on that task.
    socket.on('join_task_room', async (payload: unknown) => {
      const taskId = (payload as Record<string, unknown>)?.taskId
      if (typeof taskId !== 'string' || !taskId) return

      try {
        const task = await prisma.task.findUnique({
          where:  { id: taskId },
          select: { buyerId: true, workerId: true },
        })
        if (!task) return

        const isAuthorized = task.buyerId === user.id || task.workerId === user.id
        if (!isAuthorized) {
          socket.emit('error', { message: 'Not authorized for this task room' })
          return
        }

        void socket.join(`task:${taskId}`)
        logger.info({ userId: user.id, taskId }, 'Joined task room')
      } catch (err) {
        logger.error({ err, taskId }, 'join_task_room error')
      }
    })

    // ── leave_task_room ──────────────────────────────────────────────────────
    socket.on('leave_task_room', (payload: unknown) => {
      const taskId = (payload as Record<string, unknown>)?.taskId
      if (typeof taskId !== 'string' || !taskId) return
      void socket.leave(`task:${taskId}`)
      logger.info({ userId: user.id, taskId }, 'Left task room')
    })

    // ── worker:gps ──────────────────────────────────────────────────────────
    // Rate-limited to 1 update per 10 s per worker+task (Redis key).
    // Verifies worker is assigned + IN_PROGRESS before saving + broadcasting.
    socket.on('worker:gps', async (payload: unknown) => {
      if (user.role !== 'WORKER') return
      if (!payload || typeof payload !== 'object') return

      const { taskId, lat, lng, accuracy } = payload as Record<string, unknown>

      if (
        typeof taskId   !== 'string' ||
        typeof lat      !== 'number' ||
        typeof lng      !== 'number'
      ) return

      try {
        // Rate limit: 1 update / 5 s per worker per task (5s feels smoother in demos)
        const rlKey = `gps_rl:${user.id}:${taskId}`
        const limited = await redis.exists(rlKey)
        if (limited) return
        await redis.setex(rlKey, 5, '1')

        // Verify assignment + status
        const task = await prisma.task.findUnique({
          where:  { id: taskId },
          select: { workerId: true, status: true },
        })
        if (!task || task.workerId !== user.id) {
          socket.emit('error', { message: 'Not assigned to this task' })
          return
        }
        if (task.status !== 'IN_PROGRESS') {
          socket.emit('error', { message: 'Task is not IN_PROGRESS' })
          return
        }

        // Write every 5th GPS point to DB to limit table growth; emit all for smooth real-time
        const counterKey = `gps_cnt:${user.id}:${taskId}`
        const count = await redis.incr(counterKey)
        await redis.expire(counterKey, 86400) // expire after 24h
        if (count % 5 === 0) {
          await prisma.taskLocationLog.create({
            data: {
              taskId,
              workerId: user.id,
              lat,
              lng,
              accuracy: typeof accuracy === 'number' ? accuracy : null,
            },
          })
        }

        const timestamp = new Date().toISOString()
        io!.to(`task:${taskId}`).emit('worker:location', { lat, lng, accuracy, timestamp })

        logger.debug({ userId: user.id, taskId, lat, lng }, 'GPS update relayed')
      } catch (err) {
        logger.error({ err, taskId }, 'worker:gps error')
      }
    })

    // ── chat:send ────────────────────────────────────────────────────────────
    // Relay a chat message to all members of a task room (buyer + worker only).
    // Messages are persisted to DB for history replay on reconnect.
    socket.on('chat:send', async (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const { taskId, content } = payload as Record<string, unknown>
      if (typeof taskId !== 'string' || typeof content !== 'string' || !content.trim()) return

      try {
        const task = await prisma.task.findUnique({
          where:  { id: taskId },
          select: { buyerId: true, workerId: true },
        })
        if (!task) return

        const isAuthorized = task.buyerId === user.id || task.workerId === user.id
        if (!isAuthorized) {
          socket.emit('error', { message: 'Not authorized for this task chat' })
          return
        }

        const sender = await prisma.user.findUnique({
          where:  { id: user.id },
          select: { id: true, name: true, role: true },
        })

        // Persist to DB so history survives reconnects/restarts
        const saved = await prisma.chatMessage.create({
          data: {
            taskId,
            senderId:   user.id,
            senderRole: user.role,
            content:    content.trim(),
          },
        })

        io!.to(`task:${taskId}`).emit('chat:message', {
          id:        saved.id,
          from:      sender ?? { id: user.id, name: user.email, role: user.role },
          content:   saved.content,
          taskId,
          timestamp: saved.createdAt.toISOString(),
        })
      } catch (err) {
        logger.error({ err, taskId }, 'chat:send error')
      }
    })

    socket.on('disconnect', () => {
      logger.info({ userId: user.id, socketId: socket.id }, 'Socket disconnected')
    })
  })

  return io
}

// ─── Emit helpers ─────────────────────────────────────────────────────────────
// Safe to call from any module at any time — no-op if socket not yet inited.

export function emitTaskUpdated(taskId: string, status: string): void {
  io?.to(`task:${taskId}`).emit('task:updated', { taskId, status })
}

export function emitTaskPhotoAdded(taskId: string, media: object): void {
  io?.to(`task:${taskId}`).emit('task:photo_added', { taskId, media })
}

export function emitNotification(userId: string, notification: object): void {
  io?.to(`user:${userId}`).emit('notification:new', { notification })
}
