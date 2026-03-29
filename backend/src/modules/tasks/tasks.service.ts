import { Prisma, type Role, type Task, type TaskStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../lib/errors'
import { assertTransition } from './tasks.state-machine'
import { DIRTY_LEVEL_PRICING } from './tasks.schema'
import { emitTaskUpdated } from '../../realtime/socket'
import { logTaskEvent } from '../../lib/event-log'
import { payoutQueue, PAYOUT_QUEUE } from '../../jobs/payout.job'
import { verifyPaymentSignature, refundPayment } from '../payments/payment.service'
import { logger } from '../../lib/logger'
import type {
  CreateTaskInput,
  ReasonInput,
  LocationUpdateInput,
  ListTasksQuery,
  OpenTasksQuery,
  RateTaskInput,
  StartTaskInput,
} from './tasks.schema'

// ─── Worker scheduling constants ─────────────────────────────────────────────
// Sequential queue model: workers do ONE task at a time, queue up to 5 per day
const MAX_QUEUED_TASKS       = 5     // max ACCEPTED tasks (worker's daily queue)
const COOLDOWN_MINUTES       = 30    // rest + travel time between tasks
const WORK_WINDOW_START_HOUR = 7     // 7:00 AM — earliest task start
const WORK_WINDOW_END_HOUR   = 16    // 4:00 PM — latest task start (4:30 PM buffer)
const WORK_WINDOW_END_MIN    = 30    // 4:30 PM

// ─── Haversine distance (km) ──────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchTaskOrThrow(taskId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  return task
}

async function recordEvent(
  tx: Prisma.TransactionClient,
  taskId: string,
  actor: string,
  actorRole: Role,
  from: TaskStatus,
  to: TaskStatus,
  note?: string,
): Promise<void> {
  await tx.taskEvent.create({
    data: {
      taskId,
      actor,
      actorRole,
      from,
      to,
      note: note ?? null,
    },
  })
}

// ─── BUYER — create ───────────────────────────────────────────────────────────

export async function createTask(buyerId: string, input: CreateTaskInput) {
  const pricing = DIRTY_LEVEL_PRICING[input.dirtyLevel]
  const rateCents = input.rateCents ?? pricing.default

  if (rateCents < pricing.min) {
    throw new BadRequestError(
      `Minimum rate for ${input.dirtyLevel} dirty level is ${pricing.min} cents`,
    )
  }

  // ── Razorpay payment verification (when payment fields are provided) ─────
  let razorpayOrderId:   string | null = null
  let razorpayPaymentId: string | null = null

  if (input.razorpayOrderId && input.razorpayPaymentId && input.razorpaySignature) {
    const valid = verifyPaymentSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature,
    )
    if (!valid) {
      throw new BadRequestError('Payment verification failed — invalid signature')
    }
    razorpayOrderId   = input.razorpayOrderId
    razorpayPaymentId = input.razorpayPaymentId
  }

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title:           input.title,
        description:     input.description,
        category:        input.category,
        dirtyLevel:      input.dirtyLevel,
        urgency:         input.urgency,
        rateCents,
        buyerId,
        locationLat:     input.locationLat ?? null,
        locationLng:     input.locationLng ?? null,
        locationAddress: input.locationAddress ?? null,
        zoneId:          input.zoneId ?? null,
        workWindowStart: input.workWindowStart,
        workWindowEnd:   input.workWindowEnd,
        uploadWindowEnd: input.uploadWindowEnd,
        timezone:        input.timezone,
        razorpayOrderId,
        razorpayPaymentId,
      },
    })

    await tx.buyerProfile.update({
      where:  { userId: buyerId },
      data:   { totalTasksPosted: { increment: 1 } },
    })

    await recordEvent(tx, task.id, buyerId, 'BUYER', 'OPEN', 'OPEN')

    return task
  })

  logTaskEvent(result.id, 'created', buyerId, 'BUYER', {
    title: result.title, category: result.category, dirtyLevel: result.dirtyLevel,
    rateCents: result.rateCents, zoneId: result.zoneId,
  })

  return result
}

// ─── BUYER — list + detail ────────────────────────────────────────────────────

export async function listBuyerTasks(buyerId: string, query: ListTasksQuery) {
  const where: Prisma.TaskWhereInput = {
    buyerId,
    ...(query.status && { status: { in: query.status } }),
  }
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
      include: { worker: { select: { id: true, name: true, email: true } }, buyer: { select: { id: true, name: true } } },
    }),
    prisma.task.count({ where }),
  ])
  return { tasks, total, page: query.page, limit: query.limit }
}

export async function getBuyerTask(buyerId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where:   { id: taskId },
    include: { media: true, locationLogs: true, events: true, payout: true, worker: { select: { id: true, name: true, email: true } } },
  })
  if (!task) throw new NotFoundError('Task not found')
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  return task
}

// ─── BUYER — cancel ───────────────────────────────────────────────────────────

export async function cancelTaskAsBuyer(
  buyerId: string,
  taskId: string,
  input: ReasonInput,
) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'CANCELLED', 'BUYER')

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Re-read inside transaction to prevent TOCTOU race
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'CANCELLED') throw new ConflictError('Task is already cancelled')
        assertTransition(fresh.status, 'CANCELLED', 'BUYER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data: {
            status:             'CANCELLED',
            cancellationReason: input.reason,
            cancelledAt:        new Date(),
          },
        })

        if (fresh.workerId) {
          await tx.workerProfile.update({
            where: { userId: fresh.workerId },
            data:  { activeTaskId: null },
          })

          await tx.notification.create({
            data: {
              userId: fresh.workerId,
              type:   'TASK_REJECTED',
              title:  'Task Cancelled by Buyer',
              body:   `Task "${fresh.title}" was cancelled by the buyer: ${input.reason}`,
              data:   { taskId },
            },
          })
        }

        await recordEvent(tx, taskId, buyerId, 'BUYER', fresh.status, 'CANCELLED', input.reason)
        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }

  // ── Refund buyer if task had a Razorpay payment ──────────────────────────
  // Guard: only refund if task actually has a payment AND isn't already refunded
  if (task.razorpayPaymentId) {
    try {
      // Check if refund already exists (prevents double-refund on concurrent cancels)
      const existingRefund = await prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true, razorpayPaymentId: true },
      })
      if (existingRefund?.status === 'CANCELLED') {
        await refundPayment(task.razorpayPaymentId, task.rateCents)
      }
    } catch (err) {
      // Log but don't block — cancellation succeeded, refund can be retried manually
      logger.error({ taskId, paymentId: task.razorpayPaymentId, err }, 'Auto-refund failed on task cancel')
    }
  }

  emitTaskUpdated(taskId, 'CANCELLED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'CANCELLED', reason: input.reason })
  return result
}

// ─── BUYER — approve ──────────────────────────────────────────────────────────

export async function approveTask(buyerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  if (!task.workerId) throw new BadRequestError('Task has no assigned worker')
  assertTransition(task.status, 'APPROVED', 'BUYER')

  const platformFeeCents  = Math.floor(task.rateCents * 0.10)
  const workerAmountCents = task.rateCents - platformFeeCents

  let updatedTask: Task
  let payoutId: string

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Re-read inside SERIALIZABLE tx to prevent approve+dispute race
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'APPROVED') throw new ConflictError('Task is already approved')
        assertTransition(fresh.status, 'APPROVED', 'BUYER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  { status: 'APPROVED', completedAt: new Date() },
        })

        const payout = await tx.payout.create({
          data: {
            taskId,
            workerId:          task.workerId!,
            buyerId,
            amountCents:       task.rateCents,
            platformFeeCents,
            workerAmountCents,
            status:            'PENDING',
          },
        })

        await tx.workerProfile.update({
          where: { userId: task.workerId! },
          data:  { activeTaskId: null, completedTasks: { increment: 1 } },
        })

        const buyer = await tx.user.findUnique({ where: { id: buyerId } })
        if (buyer?.role === 'BUYER') {
          await tx.buyerProfile.update({
            where: { userId: buyerId },
            data:  { totalSpentCents: { increment: task.rateCents } },
          })
        }

        await recordEvent(tx, taskId, buyerId, 'BUYER', fresh.status, 'APPROVED')

        await tx.notification.create({
          data: {
            userId: task.workerId!,
            type:   'PAYMENT_RECEIVED',
            title:  'Task Approved!',
            body:   `Your work has been approved. ₹${workerAmountCents / 100} will be credited to your wallet.`,
            data:   { taskId },
          },
        })

        // If this task originated from a citizen report, mark it resolved and notify the citizen
        const linkedReport = await tx.citizenReport.findFirst({
          where: { linkedTaskId: taskId },
        })
        if (linkedReport) {
          await tx.citizenReport.update({
            where: { id: linkedReport.id },
            data:  { status: 'RESOLVED' },
          })
          await tx.notification.create({
            data: {
              userId: linkedReport.reporterId,
              type:   'REPORT_UPDATED',
              title:  'Your Reported Issue Has Been Resolved!',
              body:   `The cleaning task for your report on "${task.title}" has been completed and approved.`,
              data:   { reportId: linkedReport.id, taskId },
            },
          })
        }

        return { updatedTask: updated, payoutId: payout.id }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    updatedTask = result.updatedTask
    payoutId = result.payoutId
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }

  // Enqueue after transaction commits — jobId ensures idempotency on retry
  await payoutQueue.add(
    PAYOUT_QUEUE,
    { payoutId },
    { jobId: `payout_${payoutId}` },
  )

  emitTaskUpdated(taskId, 'APPROVED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'APPROVED', rateCents: task.rateCents })
  return updatedTask
}

// ─── BUYER — reject (sets REJECTED so worker can retry or dispute) ────────────

export async function rejectTask(buyerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'REJECTED', 'BUYER')

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'REJECTED') throw new ConflictError('Task is already rejected')
        assertTransition(fresh.status, 'REJECTED', 'BUYER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  { status: 'REJECTED', rejectionReason: input.reason },
        })

        if (fresh.workerId) {
          await tx.workerProfile.update({
            where: { userId: fresh.workerId },
            data:  { activeTaskId: null },
          })

          await tx.notification.create({
            data: {
              userId: fresh.workerId,
              type:   'TASK_REJECTED',
              title:  'Submission Rejected',
              body:   `Your submission for "${fresh.title}" was rejected: ${input.reason}`,
              data:   { taskId },
            },
          })
        }

        await recordEvent(tx, taskId, buyerId, 'BUYER', fresh.status, 'REJECTED', input.reason)
        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }
  emitTaskUpdated(taskId, 'REJECTED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'REJECTED', reason: input.reason })
  return result
}

// ─── WORKER — browse open tasks ───────────────────────────────────────────────

export async function getOpenTasks(query: OpenTasksQuery) {
  const where: Prisma.TaskWhereInput = {
    status: 'OPEN',
    ...(query.category && { category: query.category }),
    ...(query.urgency  && { urgency:  query.urgency }),
  }

  // Bounding box filter when lat/lng provided (approximation without PostGIS)
  if (query.lat !== undefined && query.lng !== undefined) {
    const latDelta = query.radiusKm / 111
    const lngDelta = query.radiusKm / (111 * Math.cos((query.lat * Math.PI) / 180))
    where.locationLat = { gte: query.lat - latDelta, lte: query.lat + latDelta }
    where.locationLng = { gte: query.lng - lngDelta, lte: query.lng + lngDelta }
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.task.count({ where }),
  ])
  return { tasks, total, page: query.page, limit: query.limit }
}

export async function getWorkerTask(workerId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where:   { id: taskId },
    include: { media: true, locationLogs: true, events: true, buyer: { select: { id: true, name: true } } },
  })
  if (!task) throw new NotFoundError('Task not found')
  // Worker can view open tasks or their own tasks
  if (task.status !== 'OPEN' && task.workerId !== workerId) {
    throw new ForbiddenError('Access denied')
  }
  return task
}

export async function listWorkerTasks(workerId: string, query: ListTasksQuery) {
  const where: Prisma.TaskWhereInput = {
    workerId,
    ...(query.status && { status: { in: query.status } }),
  }
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.task.count({ where }),
  ])
  return { tasks, total, page: query.page, limit: query.limit }
}

// ─── WORKER — accept (SERIALIZABLE to prevent double-accept) ─────────────────

export async function acceptTask(workerId: string, taskId: string) {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const task = await tx.task.findUnique({ where: { id: taskId } })
        if (!task) throw new NotFoundError('Task not found')
        if (task.status !== 'OPEN') throw new ConflictError('Task is no longer available')

        const profile = await tx.workerProfile.findUnique({ where: { userId: workerId } })
        if (!profile) throw new NotFoundError('Worker profile not found')
        // Sequential queue: max 5 ACCEPTED tasks, only 1 IN_PROGRESS at a time
        const [queuedCount] = await Promise.all([
          tx.task.count({
            where: { workerId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
          }),
          tx.task.count({
            where: { workerId, status: 'IN_PROGRESS' },
          }),
        ])
        if (queuedCount >= MAX_QUEUED_TASKS)
          throw new ConflictError(`You can queue at most ${MAX_QUEUED_TASKS} tasks. Complete or cancel a task first.`)

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  { status: 'ACCEPTED', workerId },
        })

        await tx.workerProfile.update({
          where: { userId: workerId },
          data:  { activeTaskId: taskId },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', 'OPEN', 'ACCEPTED')

        await tx.notification.create({
          data: {
            userId: task.buyerId,
            type:   'TASK_ASSIGNED',
            title:  'Worker Assigned',
            body:   `A worker has accepted your task "${task.title}".`,
            data:   { taskId, workerId },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    emitTaskUpdated(taskId, 'ACCEPTED')
    logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'OPEN', to: 'ACCEPTED' })
    return result
  } catch (err) {
    // P2034: transaction conflict under SERIALIZABLE — safely retry as 409
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task is no longer available')
    }
    throw err
  }
}

// ─── WORKER — start (work window + geofence enforcement) ─────────────────────

export async function startTask(workerId: string, taskId: string, input?: StartTaskInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'IN_PROGRESS', 'WORKER')

  // ── Work window check: can only start between 7:00 AM and 4:30 PM (IST) ──
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const hour = nowIST.getHours()
  const min  = nowIST.getMinutes()
  if (hour < WORK_WINDOW_START_HOUR) {
    throw new BadRequestError(
      `Work starts at ${WORK_WINDOW_START_HOUR}:00 AM. Please wait until then.`,
    )
  }
  if (hour > WORK_WINDOW_END_HOUR || (hour === WORK_WINDOW_END_HOUR && min >= WORK_WINDOW_END_MIN)) {
    throw new BadRequestError(
      'Work window has ended for today (4:30 PM). You can start tasks again tomorrow at 7:00 AM.',
    )
  }

  // ── Geofence: if task has a location and worker sent GPS, enforce 2km radius ──
  if (
    task.locationLat !== null &&
    task.locationLng !== null &&
    input?.lat !== undefined &&
    input?.lng !== undefined
  ) {
    const distKm = haversineKm(input.lat, input.lng, task.locationLat, task.locationLng)
    if (distKm > 2) {
      throw new BadRequestError(
        `You must be within 2km of the task location to start. You are ${distKm.toFixed(1)}km away.`,
      )
    }
  }

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Re-read inside SERIALIZABLE tx to prevent double-start race
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'IN_PROGRESS') throw new ConflictError('Task is already in progress')
        assertTransition(fresh.status, 'IN_PROGRESS', 'WORKER')

        // ── One task at a time: block if another task is IN_PROGRESS ──
        const inProgress = await tx.task.findFirst({
          where: { workerId, status: 'IN_PROGRESS', id: { not: taskId } },
          select: { id: true, title: true },
        })
        if (inProgress) {
          throw new ConflictError(
            `Complete your current task first: "${inProgress.title}". You can only work on one task at a time.`,
          )
        }

        // ── Cooldown: 30 min rest after last task submission ──
        const lastSubmitted = await tx.task.findFirst({
          where: { workerId, status: { in: ['SUBMITTED', 'APPROVED', 'REJECTED'] } },
          orderBy: { submittedAt: 'desc' },
          select: { submittedAt: true, title: true },
        })
        if (lastSubmitted?.submittedAt) {
          const elapsedMs = Date.now() - lastSubmitted.submittedAt.getTime()
          const cooldownMs = COOLDOWN_MINUTES * 60 * 1000
          if (elapsedMs < cooldownMs) {
            const remainMin = Math.ceil((cooldownMs - elapsedMs) / 60_000)
            throw new BadRequestError(
              `Take a ${COOLDOWN_MINUTES}-minute break between tasks. You can start in ${remainMin} minute${remainMin > 1 ? 's' : ''}.`,
            )
          }
        }

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  { status: 'IN_PROGRESS', startedAt: new Date() },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', fresh.status, 'IN_PROGRESS')

        await tx.notification.create({
          data: {
            userId: fresh.buyerId,
            type:   'TASK_STARTED',
            title:  'Work Started',
            body:   `Worker has started cleaning for "${fresh.title}".`,
            data:   { taskId },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }
  emitTaskUpdated(taskId, 'IN_PROGRESS')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'ACCEPTED', to: 'IN_PROGRESS' })
  return result
}

// ─── WORKER — cancel ──────────────────────────────────────────────────────────

export async function cancelTaskAsWorker(
  workerId: string,
  taskId: string,
  input: ReasonInput,
) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'CANCELLED', 'WORKER')

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'CANCELLED') throw new ConflictError('Task is already cancelled')
        assertTransition(fresh.status, 'CANCELLED', 'WORKER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  {
            status:             'CANCELLED',
            cancellationReason: input.reason,
            cancelledAt:        new Date(),
          },
        })

        await tx.workerProfile.update({
          where: { userId: workerId },
          data:  { activeTaskId: null },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', fresh.status, 'CANCELLED', input.reason)

        await tx.notification.create({
          data: {
            userId: fresh.buyerId,
            type:   'TASK_REJECTED',
            title:  'Task Cancelled by Worker',
            body:   `Worker cancelled task "${fresh.title}": ${input.reason}`,
            data:   { taskId },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }
  emitTaskUpdated(taskId, 'CANCELLED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: task.status, to: 'CANCELLED', reason: input.reason })
  return result
}

// ─── WORKER — submit ──────────────────────────────────────────────────────────

export async function submitTask(workerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'SUBMITTED', 'WORKER')

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Re-read inside SERIALIZABLE tx to prevent double-submit
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'SUBMITTED') throw new ConflictError('Task is already submitted')
        assertTransition(fresh.status, 'SUBMITTED', 'WORKER')

        // Require BEFORE + AFTER + PROOF media — checked inside transaction to avoid TOCTOU
        const media = await tx.taskMedia.findMany({ where: { taskId } })
        const types = new Set(media.map((m) => m.type))
        if (!types.has('BEFORE') || !types.has('AFTER') || !types.has('PROOF')) {
          throw new BadRequestError('Submit requires BEFORE, AFTER, and PROOF photos')
        }

        const timeSpentSecs = fresh.startedAt
          ? Math.floor((Date.now() - fresh.startedAt.getTime()) / 1000)
          : null

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  {
            status:       'SUBMITTED',
            submittedAt:  new Date(),
            timeSpentSecs,
          },
        })

        // Clear activeTaskId so worker can accept new tasks while this one is in review
        await tx.workerProfile.update({
          where: { userId: workerId },
          data:  { activeTaskId: null },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', fresh.status, 'SUBMITTED')

        await tx.notification.create({
          data: {
            userId: fresh.buyerId,
            type:   'TASK_SUBMITTED',
            title:  'Work Submitted',
            body:   `Worker has submitted work for "${fresh.title}". AI verification in progress.`,
            data:   { taskId },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }
  emitTaskUpdated(taskId, 'SUBMITTED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'IN_PROGRESS', to: 'SUBMITTED' })
  return result
}

// ─── WORKER — retry after buyer rejection (REJECTED → IN_PROGRESS) ───────────

export async function retryTask(workerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'IN_PROGRESS', 'WORKER')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data:  {
        status:       'IN_PROGRESS',
        startedAt:    new Date(), // reset timer for retry
        aiScore:      null,
        aiReasoning:  null,
      },
    })

    // Re-assign worker's activeTaskId (was cleared on rejection)
    await tx.workerProfile.update({
      where: { userId: workerId },
      data:  { activeTaskId: taskId },
    })

    await recordEvent(tx, taskId, workerId, 'WORKER', 'REJECTED', 'IN_PROGRESS')

    await tx.notification.create({
      data: {
        userId: task.buyerId,
        type:   'TASK_STARTED',
        title:  'Worker Retrying',
        body:   `Worker has accepted your feedback and is retrying "${task.title}".`,
        data:   { taskId },
      },
    })

    return updated
  })
  emitTaskUpdated(taskId, 'IN_PROGRESS')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'REJECTED', to: 'IN_PROGRESS', action: 'retry' })
  return result
}

// ─── WORKER — dispute ─────────────────────────────────────────────────────────

export async function disputeTask(workerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'DISPUTED', 'WORKER')

  let result: Task
  try {
    result = await prisma.$transaction(
      async (tx) => {
        // Re-read inside SERIALIZABLE tx to prevent approve+dispute race
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'DISPUTED') throw new ConflictError('Task is already disputed')
        assertTransition(fresh.status, 'DISPUTED', 'WORKER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  { status: 'DISPUTED', rejectionReason: input.reason },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', fresh.status, 'DISPUTED', input.reason)

        await tx.notification.create({
          data: {
            userId: fresh.buyerId,
            type:   'TASK_DISPUTED',
            title:  'Task Disputed',
            body:   `Worker has raised a dispute for "${fresh.title}": ${input.reason}`,
            data:   { taskId },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new ConflictError('Task state changed — please try again')
    }
    throw err
  }
  emitTaskUpdated(taskId, 'DISPUTED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: task.status, to: 'DISPUTED', reason: input.reason })
  return result
}

// ─── WORKER — location update ─────────────────────────────────────────────────

export async function updateLocation(
  workerId: string,
  taskId: string,
  input: LocationUpdateInput,
) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  if (task.status !== 'ACCEPTED' && task.status !== 'IN_PROGRESS') {
    throw new BadRequestError('Location updates only allowed for ACCEPTED or IN_PROGRESS tasks')
  }

  await prisma.taskLocationLog.create({
    data: {
      taskId,
      workerId,
      lat:      input.lat,
      lng:      input.lng,
      accuracy: input.accuracy ?? null,
    },
  })

  return { saved: true }
}

// ─── BUYER — rate worker ───────────────────────────────────────────────────────

export async function rateTask(buyerId: string, taskId: string, input: RateTaskInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  if (task.status !== 'APPROVED') throw new BadRequestError('Task must be approved before rating')
  if (!task.workerId) throw new BadRequestError('Task has no assigned worker')

  // Atomic rating update — uses SQL to prevent read-modify-write race condition
  // Formula: newRating = ((currentRating * (completedTasks - 1)) + newRating) / completedTasks
  await prisma.$executeRaw`
    UPDATE "WorkerProfile"
    SET rating = ROUND(
      ((COALESCE(rating, 0) * GREATEST("completedTasks" - 1, 0)) + ${input.rating})
      / GREATEST("completedTasks", 1)::numeric,
      1
    )
    WHERE "userId" = ${task.workerId}
  `

  return { rated: true }
}
