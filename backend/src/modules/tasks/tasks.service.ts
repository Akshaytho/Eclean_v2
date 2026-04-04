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
import { emitTaskUpdated, emitNotification } from '../../realtime/socket'
import { sendPush } from '../../lib/push'
import { logTaskEvent } from '../../lib/event-log'
import { payoutQueue, PAYOUT_QUEUE } from '../../jobs/payout.job'
// selectVerificationPoints removed — hidden verification points dropped
import { verifyPaymentSignature, refundPayment, fetchRazorpayOrder } from '../payments/payment.service'
import { logger } from '../../lib/logger'
import { env } from '../../config/env'
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
const COOLDOWN_MINUTES       = process.env.NODE_ENV === 'test' ? 0 : 30    // rest + travel time between tasks
// Work window constants — disabled for now, will use per-task DB fields
// const WORK_WINDOW_START_HOUR = 7
// const WORK_WINDOW_END_HOUR   = 16
// const WORK_WINDOW_END_MIN    = 30

// ─── Serializable transaction retry helper ────────────────────────────────────
// PostgreSQL SERIALIZABLE isolation can throw P2034 on concurrent row access.
// We retry the whole operation up to MAX_RETRIES times with a small delay.
const SERIALIZABLE_MAX_RETRIES = 5
const SERIALIZABLE_RETRY_DELAY_MS = 50

async function withSerializableRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034' &&
        attempt < SERIALIZABLE_MAX_RETRIES
      ) {
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = SERIALIZABLE_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        const jitter = baseDelay * (0.5 + Math.random() * 0.5)
        logger.warn({ attempt, maxRetries: SERIALIZABLE_MAX_RETRIES, delayMs: Math.round(jitter) }, 'Serializable conflict — retrying')
        await new Promise((r) => setTimeout(r, jitter))
        continue
      }
      throw err
    }
  }
  // TypeScript: unreachable but satisfies return type
  throw new Error('withSerializableRetry exhausted')
}

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

  // ── Razorpay payment enforcement ─────────────────────────────────────────
  // In production, buyers MUST pay before creating a task
  const razorpayConfigured = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_ID !== 'test_mode'
  if (razorpayConfigured && (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature)) {
    throw new BadRequestError('Payment is required to create a task. Please complete payment first.')
  }

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

    // SECURITY: verify Razorpay order amount matches the task rate
    // Without this check, a buyer could pay ₹1 but create a ₹180 task
    const rzpOrder = await fetchRazorpayOrder(input.razorpayOrderId)
    if (rzpOrder.amount !== rateCents) {
      throw new BadRequestError(
        `Payment amount mismatch: paid ${rzpOrder.amount} paise but task rate is ${rateCents} paise`,
      )
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
    include: { media: true, locationLogs: { take: 100, orderBy: { createdAt: 'desc' } }, events: true, payout: true, worker: { select: { id: true, name: true, email: true } } },
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

  // User-friendly error when buyer tries to cancel an in-progress task
  if (task.status === 'IN_PROGRESS') {
    throw new BadRequestError(
      'Cannot cancel a task while work is in progress. Please wait for the worker to submit, then you can reject if unsatisfied.',
    )
  }

  assertTransition(task.status, 'CANCELLED', 'BUYER')

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // Re-read inside transaction to prevent TOCTOU race
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'CANCELLED') throw new ConflictError('Task is already cancelled')
        if (fresh.status === 'APPROVED') throw new ConflictError('Task has already been approved and payment released')
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

        // Set refundedAt FLAG inside tx to prevent double-refund (atomic claim)
        // Actual Razorpay API call happens AFTER tx commits to avoid holding locks
        let needsRefund = false
        if (fresh.razorpayPaymentId && !fresh.refundedAt) {
          await tx.task.update({
            where: { id: taskId },
            data:  { refundedAt: new Date() },
          })
          needsRefund = true
        }

        await recordEvent(tx, taskId, buyerId, 'BUYER', fresh.status, 'CANCELLED', input.reason)
        return { ...updated, _needsRefund: needsRefund }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  )

  // Refund OUTSIDE the transaction — avoids holding serializable locks during HTTP call
  if ((result as any)._needsRefund && task.razorpayPaymentId) {
    try {
      await refundPayment(task.razorpayPaymentId, task.rateCents)
    } catch (err) {
      // Log but don't block — refundedAt is set so it won't retry, admin can refund manually
      logger.error({ taskId, paymentId: task.razorpayPaymentId, err }, 'Auto-refund failed on task cancel')
    }
  }

  emitTaskUpdated(taskId, 'CANCELLED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'CANCELLED', reason: input.reason })

  // Push + socket for worker: buyer cancelled task
  if (task.workerId) {
    void sendPush(task.workerId, 'Task Cancelled by Buyer', `Task "${task.title}" was cancelled: ${input.reason}`, { taskId })
    emitNotification(task.workerId, { type: 'TASK_REJECTED', title: 'Task Cancelled by Buyer', body: input.reason, data: { taskId } })
  }

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

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
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
    ),
  )
  updatedTask = result.updatedTask
  payoutId = result.payoutId

  // Enqueue after transaction commits — jobId ensures idempotency on retry
  await payoutQueue.add(
    PAYOUT_QUEUE,
    { payoutId },
    { jobId: `payout_${payoutId}` },
  )

  emitTaskUpdated(taskId, 'APPROVED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'APPROVED', rateCents: task.rateCents })

  // Push + socket for worker: task approved
  const workerAmtDisplay = (task.rateCents - Math.floor(task.rateCents * 0.10)) / 100
  void sendPush(task.workerId!, 'Task Approved!', `Your work has been approved. ₹${workerAmtDisplay} will be credited.`, { taskId })
  emitNotification(task.workerId!, { type: 'PAYMENT_RECEIVED', title: 'Task Approved!', body: `₹${workerAmtDisplay} will be credited.`, data: { taskId } })

  return updatedTask
}

// ─── BUYER — reject (sets REJECTED so worker can retry or dispute) ────────────

export async function rejectTask(buyerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'REJECTED', 'BUYER')

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
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
    ),
  )
  emitTaskUpdated(taskId, 'REJECTED')
  logTaskEvent(taskId, 'status_changed', buyerId, 'BUYER', { from: task.status, to: 'REJECTED', reason: input.reason })

  // Push + socket for worker: task rejected
  if (task.workerId) {
    void sendPush(task.workerId, 'Task Rejected', `Your submission for "${task.title}" was rejected. You can retry or dispute.`, { taskId })
    emitNotification(task.workerId, { type: 'TASK_REJECTED', title: 'Task Rejected', body: `Rejected: ${input.reason}`, data: { taskId } })
  }

  // Buyer accountability: stricter protection for workers
  // 1st false rejection: warning notification + -10 trust
  // 2nd: frontend requires 50-char justification
  // 3rd: account flagged for admin review
  if (task.aiScore != null && task.aiScore >= 0.85) {
    prisma.buyerProfile.update({
      where: { userId: buyerId },
      data: {
        falseRejectionCount: { increment: 1 },
        buyerTrustScore:     { decrement: 10 },  // -10 per false rejection (was -5)
      },
    }).then(async (profile) => {
      if (profile.falseRejectionCount >= 3 && !profile.isFlaggedForReview) {
        // 3rd strike: flag for admin — all future rejections need admin approval
        await prisma.buyerProfile.update({
          where: { userId: buyerId },
          data: { isFlaggedForReview: true },
        })
        logger.warn({ buyerId, falseRejections: profile.falseRejectionCount }, 'Buyer flagged — 3rd false rejection of AI-approved work')
      } else if (profile.falseRejectionCount === 1) {
        // 1st strike: warning notification
        await prisma.notification.create({
          data: {
            userId: buyerId,
            type: 'TASK_DISPUTED',  // reusing existing type for buyer warning
            title: 'Rejection Warning',
            body: `AI verified this work at ${Math.round(task.aiScore! * 100)}%. Repeated rejections of verified work may result in account review.`,
            data: { taskId, aiScore: task.aiScore },
          },
        }).catch(() => {})
      }
    }).catch((err) => {
      logger.error({ buyerId, err }, 'Failed to update buyer accountability')
    })
  }

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
    include: { media: true, locationLogs: { take: 100, orderBy: { createdAt: 'desc' } }, events: true, buyer: { select: { id: true, name: true } } },
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
  // PERF: check queue limit BEFORE the atomic claim to avoid unnecessary DB contention
  const queuedCount = await prisma.task.count({
    where: { workerId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
  })
  if (queuedCount >= MAX_QUEUED_TASKS) {
    throw new ConflictError(`You can queue at most ${MAX_QUEUED_TASKS} tasks. Complete or cancel a task first.`)
  }

  // PERF: atomic optimistic claim — replaces SERIALIZABLE transaction
  // 50 workers hitting this simultaneously: only 1 wins, others get count=0 instantly
  // No retry storm, no connection pool exhaustion, no serialization failures
  const claimed = await prisma.task.updateMany({
    where: { id: taskId, status: 'OPEN' },
    data:  { status: 'ACCEPTED', workerId },
  })
  if (claimed.count === 0) {
    throw new ConflictError('Task is no longer available')
  }

  // Post-claim work in a regular (non-serializable) transaction
  const result = await prisma.$transaction(
      async (tx) => {
        // Re-check queue limit inside tx to prevent TOCTOU race
        // (multiple workers could pass the pre-check simultaneously)
        const queuedNow = await tx.task.count({
          where: { workerId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
        })
        if (queuedNow > MAX_QUEUED_TASKS) {
          // Undo the claim — another concurrent accept pushed us over the limit
          await tx.task.update({
            where: { id: taskId },
            data:  { status: 'OPEN', workerId: null },
          })
          throw new ConflictError(`You can queue at most ${MAX_QUEUED_TASKS} tasks. Complete or cancel a task first.`)
        }

        const task = await tx.task.findUnique({ where: { id: taskId } })
        if (!task) throw new NotFoundError('Task not found')

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

        return task
      },
  )
  emitTaskUpdated(taskId, 'ACCEPTED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'OPEN', to: 'ACCEPTED' })

  // Push + socket for buyer: worker accepted
  void sendPush(result.buyerId, 'Worker Assigned', `A worker has accepted your task "${result.title}".`, { taskId })
  emitNotification(result.buyerId, { type: 'TASK_ASSIGNED', title: 'Worker Assigned', body: `A worker has accepted your task "${result.title}".`, data: { taskId } })

  return result
}

// ─── WORKER — start (work window + geofence enforcement) ─────────────────────

export async function startTask(workerId: string, taskId: string, input: StartTaskInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'IN_PROGRESS', 'WORKER')

  // Work window check disabled — will be re-enabled with configurable per-task windows
  // TODO: restore with task.workWindowStart / task.workWindowEnd from DB instead of hardcoded constants

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

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
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

        // Set activeTaskId on START (not accept) — allows queuing multiple ACCEPTED tasks
        await tx.workerProfile.update({
          where: { userId: workerId },
          data:  { activeTaskId: taskId },
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

        // SECURITY: store worker's environmental DNA for anti-spoofing comparison
        if (input.envDNA) {
          await tx.workerEnvironmentCapture.create({
            data: {
              taskId,
              workerId,
              captureType:  'START',
              magX:         input.envDNA.magX ?? null,
              magY:         input.envDNA.magY ?? null,
              magZ:         input.envDNA.magZ ?? null,
              barometer:    input.envDNA.barometer ?? null,
              ambientLight: input.envDNA.ambientLight ?? null,
              cellType:     input.envDNA.cellType ?? null,
              cellCarrier:  input.envDNA.cellCarrier ?? null,
              wifiNetworks: input.envDNA.wifiNetworks ?? null,
              capturedAt:   new Date(input.envDNA.capturedAt),
            },
          })
        }

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  )
  emitTaskUpdated(taskId, 'IN_PROGRESS')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'ACCEPTED', to: 'IN_PROGRESS' })

  // Push + socket for buyer: work started
  void sendPush(task.buyerId, 'Work Started', `Worker has started cleaning for "${task.title}".`, { taskId })
  emitNotification(task.buyerId, { type: 'TASK_STARTED', title: 'Work Started', body: `Worker started "${task.title}".`, data: { taskId } })

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
  // Worker cancel returns task to OPEN so other workers can pick it up
  assertTransition(task.status, 'OPEN', 'WORKER')

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'OPEN') throw new ConflictError('Task is already open')
        assertTransition(fresh.status, 'OPEN', 'WORKER')

        const updated = await tx.task.update({
          where: { id: taskId },
          data:  {
            status:             'OPEN',
            workerId:           null,               // release task for other workers
            cancellationReason: input.reason,
            startedAt:          null,                // clear all timestamps
            submittedAt:        null,
            completedAt:        null,
          },
        })

        // SECURITY: clean up worker's media and submissions to prevent piggyback attacks
        // Without this, a colluding second worker could claim the first worker's photos
        await tx.taskMedia.deleteMany({
          where: { taskId, type: { in: ['BEFORE', 'AFTER', 'PROOF'] } },
        })
        await tx.workerPointSubmission.deleteMany({
          where: { taskId, workerId },
        })
        await tx.taskLocationLog.deleteMany({
          where: { taskId, workerId },
        })

        await tx.workerProfile.update({
          where: { userId: workerId },
          data:  { activeTaskId: null },
        })

        await recordEvent(tx, taskId, workerId, 'WORKER', fresh.status, 'OPEN', input.reason)

        await tx.notification.create({
          data: {
            userId: fresh.buyerId,
            type:   'TASK_REJECTED',
            title:  'Worker Left Task',
            body:   `Worker left task "${fresh.title}": ${input.reason}. It's now available for other workers.`,
            data:   { taskId, reopened: true },
          },
        })

        return updated
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  )
  emitTaskUpdated(taskId, 'OPEN')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: task.status, to: 'OPEN', reason: input.reason })
  return result
}

// ─── WORKER — submit ──────────────────────────────────────────────────────────

export async function submitTask(workerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'SUBMITTED', 'WORKER')

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        // Re-read inside SERIALIZABLE tx to prevent double-submit
        const fresh = await tx.task.findUnique({ where: { id: taskId } })
        if (!fresh) throw new NotFoundError('Task not found')
        if (fresh.status === 'SUBMITTED') throw new ConflictError('Task is already submitted')
        assertTransition(fresh.status, 'SUBMITTED', 'WORKER')

        // ── Media validation ─────────────────────────────────────────────────
        // Tasks with reference points use the new per-point submission system.
        // Legacy tasks (0 reference points) use the old BEFORE + AFTER + PROOF check.
        const refPointCount = await tx.taskReferencePoint.count({ where: { taskId } })

        if (refPointCount > 0) {
          // New flow: check WorkerPointSubmission completeness
          const refPoints = await tx.taskReferencePoint.findMany({ where: { taskId } })
          const submissions = await tx.workerPointSubmission.findMany({ where: { taskId, workerId } })

          // At least 70% of all points must have AFTER submissions, minimum 3
          const afterSubs = submissions.filter((s) => s.mediaType === 'AFTER')
          const minRequired = Math.max(3, Math.ceil(refPoints.length * 0.7))
          if (afterSubs.length < minRequired) {
            throw new BadRequestError(
              `Must upload at least ${minRequired} after photos (${afterSubs.length} uploaded)`,
            )
          }

          // Verification photos are optional — missing verification lowers rule engine score
          // but does not block submission (worker may not have been close enough to reveal them)
        } else {
          // Legacy flow: require BEFORE + AFTER + PROOF in TaskMedia
          const media = await tx.taskMedia.findMany({ where: { taskId } })
          const types = new Set(media.map((m) => m.type))
          if (!types.has('BEFORE') || !types.has('AFTER') || !types.has('PROOF')) {
            throw new BadRequestError('Submit requires BEFORE, AFTER, and PROOF photos')
          }
        }

        const timeSpentSecs = fresh.startedAt
          ? Math.floor((Date.now() - fresh.startedAt.getTime()) / 1000)
          : null

        // SECURITY: enforce minimum time on-site to prevent instant-submit fraud
        // Workers must spend a reasonable minimum time based on task difficulty
        const MIN_TIME_SECS: Record<string, number> = {
          LIGHT: 300,     // 5 minutes
          MEDIUM: 600,    // 10 minutes
          HEAVY: 900,     // 15 minutes
          CRITICAL: 1200, // 20 minutes
        }
        const minRequired = MIN_TIME_SECS[fresh.dirtyLevel] ?? 300
        if (timeSpentSecs === null) {
          throw new BadRequestError('Task has no start time recorded — cannot verify time on site')
        }
        if (timeSpentSecs < minRequired) {
          const minMinutes = Math.ceil(minRequired / 60)
          throw new BadRequestError(
            `Minimum time on-site for ${fresh.dirtyLevel} tasks is ${minMinutes} minutes. ` +
            `You have only spent ${Math.floor(timeSpentSecs / 60)} minutes.`,
          )
        }

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
    ),
  )
  emitTaskUpdated(taskId, 'SUBMITTED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'IN_PROGRESS', to: 'SUBMITTED' })

  // Push + socket for buyer: work submitted, please review
  void sendPush(task.buyerId, 'Work Submitted', `Worker has submitted work for "${task.title}". Please review.`, { taskId })
  emitNotification(task.buyerId, { type: 'TASK_SUBMITTED', title: 'Work Submitted', body: `Worker submitted work for "${task.title}".`, data: { taskId } })

  return result
}

// ─── WORKER — retry after buyer rejection (REJECTED → IN_PROGRESS) ───────────

export async function retryTask(workerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'IN_PROGRESS', 'WORKER')

  // Use SERIALIZABLE to prevent double-retry race condition
  const result = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      // Re-read inside tx to prevent TOCTOU race
      const fresh = await tx.task.findUnique({ where: { id: taskId } })
      if (!fresh || fresh.status !== 'REJECTED') {
        throw new ConflictError('Task is no longer in REJECTED state')
      }

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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  )
  emitTaskUpdated(taskId, 'IN_PROGRESS')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: 'REJECTED', to: 'IN_PROGRESS', action: 'retry' })

  // Push + socket for buyer: worker retrying
  void sendPush(task.buyerId, 'Worker Retrying', `Worker is retrying work for "${task.title}".`, { taskId })
  emitNotification(task.buyerId, { type: 'TASK_STARTED', title: 'Worker Retrying', body: `Worker accepted feedback and is retrying.`, data: { taskId } })

  return result
}

// ─── WORKER — dispute ─────────────────────────────────────────────────────────

export async function disputeTask(workerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'DISPUTED', 'WORKER')

  const result = await withSerializableRetry(() =>
    prisma.$transaction(
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
    ),
  )
  emitTaskUpdated(taskId, 'DISPUTED')
  logTaskEvent(taskId, 'status_changed', workerId, 'WORKER', { from: task.status, to: 'DISPUTED', reason: input.reason })

  // Push + socket for buyer: worker disputed
  void sendPush(task.buyerId, 'Task Disputed', `Worker has raised a dispute for "${task.title}".`, { taskId })
  emitNotification(task.buyerId, { type: 'TASK_DISPUTED', title: 'Task Disputed', body: input.reason, data: { taskId } })

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

  // SECURITY: prevent duplicate ratings — a malicious buyer could tank a worker's score
  if (task.ratedAt) throw new BadRequestError('Task has already been rated')

  // Use conditional update to atomically claim the rating (prevents double-tap race)
  const updated = await prisma.task.updateMany({
    where: { id: taskId, ratedAt: null },
    data:  { ratedAt: new Date(), buyerRating: input.rating },
  })
  if (updated.count === 0) throw new BadRequestError('Task has already been rated')

  // Atomic rating update — uses SQL to prevent read-modify-write race condition
  // Formula: newRating = ((currentRating * (completedTasks - 1)) + newRating) / completedTasks
  await prisma.$executeRaw`
    UPDATE "WorkerProfile"
    SET rating = ROUND(
      (((COALESCE(rating, 0) * GREATEST("completedTasks" - 1, 0)) + ${input.rating})
      / GREATEST("completedTasks", 1))::numeric,
      1
    )
    WHERE "userId" = ${task.workerId}
  `

  return { rated: true }
}
