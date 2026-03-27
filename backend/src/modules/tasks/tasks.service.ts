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
import { payoutQueue, PAYOUT_QUEUE } from '../../jobs/payout.job'
import type {
  CreateTaskInput,
  ReasonInput,
  LocationUpdateInput,
  ListTasksQuery,
  OpenTasksQuery,
  RateTaskInput,
  StartTaskInput,
} from './tasks.schema'

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

  return prisma.$transaction(async (tx) => {
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
      },
    })

    await tx.buyerProfile.update({
      where:  { userId: buyerId },
      data:   { totalTasksPosted: { increment: 1 } },
    })

    await recordEvent(tx, task.id, buyerId, 'BUYER', 'OPEN', 'OPEN')

    return task
  })
}

// ─── BUYER — list + detail ────────────────────────────────────────────────────

export async function listBuyerTasks(buyerId: string, query: ListTasksQuery) {
  const where: Prisma.TaskWhereInput = {
    buyerId,
    ...(query.status && { status: query.status }),
  }
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
      include: { worker: { select: { id: true, name: true, email: true } } },
    }),
    prisma.task.count({ where }),
  ])
  return { tasks, total, page: query.page, limit: query.limit }
}

export async function getBuyerTask(buyerId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where:   { id: taskId },
    include: { media: true, locationLogs: true, events: true, payout: true },
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

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        status:             'CANCELLED',
        cancellationReason: input.reason,
        cancelledAt:        new Date(),
      },
    })

    if (task.workerId) {
      await tx.workerProfile.update({
        where: { userId: task.workerId },
        data:  { activeTaskId: null },
      })

      await tx.notification.create({
        data: {
          userId: task.workerId,
          type:   'TASK_REJECTED',
          title:  'Task Cancelled by Buyer',
          body:   `Task "${task.title}" was cancelled by the buyer: ${input.reason}`,
          data:   { taskId },
        },
      })
    }

    await recordEvent(tx, taskId, buyerId, 'BUYER', task.status, 'CANCELLED', input.reason)
    return updated
  })
  emitTaskUpdated(taskId, 'CANCELLED')
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

  const { updatedTask, payoutId } = await prisma.$transaction(async (tx) => {
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

    await recordEvent(tx, taskId, buyerId, 'BUYER', task.status, 'APPROVED')

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
  })

  // Enqueue after transaction commits — jobId ensures idempotency on retry
  await payoutQueue.add(
    PAYOUT_QUEUE,
    { payoutId },
    { jobId: `payout_${payoutId}` },
  )

  emitTaskUpdated(taskId, 'APPROVED')
  return updatedTask
}

// ─── BUYER — reject (sets REJECTED so worker can retry or dispute) ────────────

export async function rejectTask(buyerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'REJECTED', 'BUYER')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data:  { status: 'REJECTED', rejectionReason: input.reason },
    })

    if (task.workerId) {
      // Free the worker so they can accept other tasks while deciding whether to retry
      await tx.workerProfile.update({
        where: { userId: task.workerId },
        data:  { activeTaskId: null },
      })

      await tx.notification.create({
        data: {
          userId: task.workerId,
          type:   'TASK_REJECTED',
          title:  'Submission Rejected',
          body:   `Your submission for "${task.title}" was rejected: ${input.reason}`,
          data:   { taskId },
        },
      })
    }

    await recordEvent(tx, taskId, buyerId, 'BUYER', task.status, 'REJECTED', input.reason)
    return updated
  })
  emitTaskUpdated(taskId, 'REJECTED')
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
    include: { media: true, locationLogs: true, events: true },
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
    ...(query.status && { status: query.status }),
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
        if (profile.activeTaskId !== null) throw new ConflictError('You already have an active task')

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

  // Geofence: if task has a location and worker sent their GPS, enforce 2km radius
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

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data:  { status: 'IN_PROGRESS', startedAt: new Date() },
    })

    await recordEvent(tx, taskId, workerId, 'WORKER', 'ACCEPTED', 'IN_PROGRESS')

    await tx.notification.create({
      data: {
        userId: task.buyerId,
        type:   'TASK_STARTED',
        title:  'Work Started',
        body:   `Worker has started cleaning for "${task.title}".`,
        data:   { taskId },
      },
    })

    return updated
  })
  emitTaskUpdated(taskId, 'IN_PROGRESS')
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

  const result = await prisma.$transaction(async (tx) => {
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

    await recordEvent(tx, taskId, workerId, 'WORKER', task.status, 'CANCELLED', input.reason)

    await tx.notification.create({
      data: {
        userId: task.buyerId,
        type:   'TASK_REJECTED',
        title:  'Task Cancelled by Worker',
        body:   `Worker cancelled task "${task.title}": ${input.reason}`,
        data:   { taskId },
      },
    })

    return updated
  })
  emitTaskUpdated(taskId, 'CANCELLED')
  return result
}

// ─── WORKER — submit ──────────────────────────────────────────────────────────

export async function submitTask(workerId: string, taskId: string) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'SUBMITTED', 'WORKER')

  const result = await prisma.$transaction(async (tx) => {
    // Require BEFORE + AFTER + PROOF media — checked inside transaction to avoid TOCTOU
    const media = await tx.taskMedia.findMany({ where: { taskId } })
    const types = new Set(media.map((m) => m.type))
    if (!types.has('BEFORE') || !types.has('AFTER') || !types.has('PROOF')) {
      throw new BadRequestError('Submit requires BEFORE, AFTER, and PROOF photos')
    }

    const timeSpentSecs = task.startedAt
      ? Math.floor((Date.now() - task.startedAt.getTime()) / 1000)
      : null

    const updated = await tx.task.update({
      where: { id: taskId },
      data:  {
        status:       'SUBMITTED',
        submittedAt:  new Date(),
        timeSpentSecs,
      },
    })

    await recordEvent(tx, taskId, workerId, 'WORKER', 'IN_PROGRESS', 'SUBMITTED')

    await tx.notification.create({
      data: {
        userId: task.buyerId,
        type:   'TASK_SUBMITTED',
        title:  'Work Submitted',
        body:   `Worker has submitted work for "${task.title}". AI verification in progress.`,
        data:   { taskId },
      },
    })

    return updated
  })
  emitTaskUpdated(taskId, 'SUBMITTED')
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
  return result
}

// ─── WORKER — dispute ─────────────────────────────────────────────────────────

export async function disputeTask(workerId: string, taskId: string, input: ReasonInput) {
  const task = await fetchTaskOrThrow(taskId)
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  assertTransition(task.status, 'DISPUTED', 'WORKER')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data:  { status: 'DISPUTED', rejectionReason: input.reason },
    })

    await recordEvent(tx, taskId, workerId, 'WORKER', task.status, 'DISPUTED', input.reason)

    await tx.notification.create({
      data: {
        userId: task.buyerId,
        type:   'TASK_DISPUTED',
        title:  'Task Disputed',
        body:   `Worker has raised a dispute for "${task.title}": ${input.reason}`,
        data:   { taskId },
      },
    })

    return updated
  })
  emitTaskUpdated(taskId, 'DISPUTED')
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

  // Compute rolling average rating for the worker
  const profile = await prisma.workerProfile.findUnique({ where: { userId: task.workerId } })
  if (profile) {
    const current = profile.rating ?? 0
    const total   = profile.completedTasks ?? 1
    const newRating = Math.round(((current * (total - 1)) + input.rating) / total * 10) / 10
    await prisma.workerProfile.update({
      where: { userId: task.workerId },
      data:  { rating: newRating },
    })
  }

  return { rated: true }
}
