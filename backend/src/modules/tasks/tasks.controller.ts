import type { FastifyRequest, FastifyReply } from 'fastify'
import * as svc from './tasks.service'
import { aiVerifyQueue } from '../../jobs/ai-verify.job'
import { prisma } from '../../lib/prisma'
import type {
  CreateTaskInput,
  ReasonInput,
  LocationUpdateInput,
  StartTaskInput,
  ListTasksQuery,
  OpenTasksQuery,
  TaskIdParam,
  RateTaskInput,
} from './tasks.schema'

// Controllers use base FastifyRequest — the validate middleware guarantees
// correct runtime types; casts here are safe.

// ─── BUYER ────────────────────────────────────────────────────────────────────

export async function createTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const task = await svc.createTask(req.user.id, req.body as CreateTaskInput)
  void reply.status(201).send({ task })
}

export async function listBuyerTasks(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.listBuyerTasks(req.user.id, req.query as ListTasksQuery)
  void reply.send(result)
}

export async function getBuyerTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.getBuyerTask(req.user.id, taskId)
  void reply.send({ task })
}

export async function cancelTaskAsBuyer(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.cancelTaskAsBuyer(req.user.id, taskId, req.body as ReasonInput)
  void reply.send({ task })
}

export async function approveTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.approveTask(req.user.id, taskId)
  void reply.send({ task })
}

export async function rejectTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.rejectTask(req.user.id, taskId, req.body as ReasonInput)
  void reply.send({ task })
}

export async function rateTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const result = await svc.rateTask(req.user.id, taskId, req.body as RateTaskInput)
  void reply.send(result)
}

// ─── WORKER ───────────────────────────────────────────────────────────────────

export async function getOpenTasks(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.getOpenTasks(req.query as OpenTasksQuery)
  void reply.send(result)
}

export async function getWorkerTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.getWorkerTask(req.user.id, taskId)
  void reply.send({ task })
}

export async function listWorkerTasks(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.listWorkerTasks(req.user.id, req.query as ListTasksQuery)
  void reply.send(result)
}

export async function acceptTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.acceptTask(req.user.id, taskId)
  void reply.status(200).send({ task })
}

export async function startTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.startTask(req.user.id, taskId, req.body as StartTaskInput | undefined)
  void reply.send({ task })
}

export async function cancelTaskAsWorker(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.cancelTaskAsWorker(req.user.id, taskId, req.body as ReasonInput)
  void reply.send({ task })
}

export async function submitTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.submitTask(req.user.id, taskId)
  await aiVerifyQueue.add(
    'verify',
    { taskId },
    { jobId: `verify-${taskId}-${Date.now()}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  )
  void reply.send({ task })
}

export async function retryTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.retryTask(req.user.id, taskId)
  void reply.send({ task })
}

export async function disputeTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const task = await svc.disputeTask(req.user.id, taskId, req.body as ReasonInput)
  void reply.send({ task })
}

export async function updateLocation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const result = await svc.updateLocation(req.user.id, taskId, req.body as LocationUpdateInput)
  void reply.send(result)
}

// ─── SHARED (BUYER + WORKER) ──────────────────────────────────────────────────

export async function getChatHistory(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as TaskIdParam
  const query = req.query as { cursor?: string; limit?: string }
  const limit  = Math.min(parseInt(query.limit ?? '50', 10), 100)
  const cursor = query.cursor // ISO date string of last fetched message

  // Verify caller is buyer or worker on this task
  const task = await prisma.task.findUnique({
    where:  { id: taskId },
    select: { buyerId: true, workerId: true },
  })
  if (!task || (task.buyerId !== req.user.id && task.workerId !== req.user.id)) {
    void reply.status(403).send({ error: 'Not authorized for this task chat' })
    return
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      taskId,
      ...(cursor && { createdAt: { lt: new Date(cursor) } }),
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })

  // Return oldest-first for display; provide nextCursor for older page
  const ordered = messages.reverse()
  const nextCursor = messages.length === limit
    ? messages[0].createdAt.toISOString()
    : null

  void reply.send({ messages: ordered, nextCursor })
}
