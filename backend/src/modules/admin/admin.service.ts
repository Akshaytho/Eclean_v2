import type { DirtyLevel } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { payoutQueue, PAYOUT_QUEUE } from '../../jobs/payout.job'
import { NotFoundError, BadRequestError } from '../../lib/errors'
import { DIRTY_LEVEL_PRICING } from '../tasks/tasks.schema'
import { assertTransition } from '../tasks/tasks.state-machine'
import type {
  ConvertToTaskInput,
  ResolveDisputeInput,
  ListUsersQuery,
  ListDisputesQuery,
} from './admin.schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urgencyToDirtyLevel(urgency: string): 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'CRITICAL' {
  if (urgency === 'LOW')      return 'LIGHT'
  if (urgency === 'MEDIUM')   return 'MEDIUM'
  if (urgency === 'CRITICAL') return 'CRITICAL'
  return 'HEAVY' // HIGH, URGENT
}

// ─── Convert citizen report → task ────────────────────────────────────────────

export async function convertReportToTask(
  reportId: string,
  adminId: string,
  input: ConvertToTaskInput,
) {
  const report = await prisma.citizenReport.findUnique({ where: { id: reportId } })
  if (!report) throw new NotFoundError('Report not found')
  if (report.linkedTaskId) throw new BadRequestError('Report has already been converted to a task')

  const effectiveBuyerId = input.buyerId ?? adminId

  const urgency    = input.urgency ?? report.urgency
  const dirtyLevel = (input.dirtyLevel ?? urgencyToDirtyLevel(urgency)) as DirtyLevel
  const rateCents  = input.rateCents ?? DIRTY_LEVEL_PRICING[dirtyLevel].default

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title:           input.title ?? `Citizen Report: ${report.description.slice(0, 80)}`,
        description:     report.description,
        category:        report.category,
        dirtyLevel,
        urgency,
        rateCents,
        buyerId:         effectiveBuyerId,
        locationLat:     report.locationLat ?? null,
        locationLng:     report.locationLng ?? null,
        locationAddress: report.locationAddress ?? null,
        zoneId:          report.zoneId ?? null,
        status:          'OPEN',
      },
    })

    await tx.citizenReport.update({
      where: { id: reportId },
      data:  { linkedTaskId: task.id, status: 'ASSIGNED' },
    })

    await tx.notification.create({
      data: {
        userId: report.reporterId,
        type:   'REPORT_UPDATED',
        title:  'Your Report Has Become a Task!',
        body:   `Your report has been converted into a cleaning task. We\'ll take care of it!`,
        data:   { reportId, taskId: task.id },
      },
    })

    return task
  })
}

// ─── Platform dashboard stats ──────────────────────────────────────────────────

export async function getAdminDashboard() {
  const [
    totalTasks,
    openTasks,
    inProgressTasks,
    completedTasks,
    disputedTasks,
    totalUsers,
    payoutStats,
    pendingReports,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.count({ where: { status: 'OPEN' } }),
    prisma.task.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.task.count({ where: { status: { in: ['APPROVED', 'COMPLETED'] } } }),
    prisma.task.count({ where: { status: 'DISPUTED' } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.payout.groupBy({
      by:     ['status'],
      _count: { id: true },
      _sum:   { workerAmountCents: true },
    }),
    prisma.citizenReport.count({ where: { status: { in: ['REPORTED', 'PENDING'] } } }),
  ])

  const usersByRole = await prisma.user.groupBy({
    by:     ['role'],
    _count: { id: true },
    where:  { isActive: true },
  })

  const totalAmountCents = payoutStats.reduce((sum, p) => sum + (p._sum.workerAmountCents ?? 0), 0)

  return {
    tasks: {
      total:      totalTasks,
      open:       openTasks,
      inProgress: inProgressTasks,
      completed:  completedTasks,
      disputed:   disputedTasks,
    },
    users: {
      total:  totalUsers,
      byRole: usersByRole.map(r => ({ role: r.role, count: r._count.id })),
    },
    payouts: {
      byStatus:        payoutStats.map(p => ({ status: p.status, count: p._count.id })),
      totalAmountCents,
    },
    openDisputes:    disputedTasks,
    pendingReports,
    totalAmountCents,
  }
}

// ─── List DISPUTED tasks ───────────────────────────────────────────────────────

export async function listDisputes(query: ListDisputesQuery) {
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where:   { status: 'DISPUTED' },
      include: {
        buyer:  { select: { id: true, name: true, email: true } },
        worker: { select: { id: true, name: true, email: true } },
        media:  true,
        events: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.task.count({ where: { status: 'DISPUTED' } }),
  ])
  return { tasks, total, page: query.page, limit: query.limit }
}

// ─── Resolve dispute ───────────────────────────────────────────────────────────

export async function resolveDispute(
  taskId: string,
  adminId: string,
  input: ResolveDisputeInput,
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.status !== 'DISPUTED') throw new BadRequestError('Task is not in DISPUTED status')

  if (input.decision === 'APPROVE') {
    assertTransition(task.status, 'APPROVED', 'SYSTEM')
    if (!task.workerId) throw new BadRequestError('Task has no assigned worker')

    const platformFeeCents  = Math.floor(task.rateCents * 0.10)
    const workerAmountCents = task.rateCents - platformFeeCents

    const { updatedTask: updated, payoutId } = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data:  { status: 'APPROVED', completedAt: new Date() },
      })

      const payout = await tx.payout.create({
        data: {
          taskId,
          workerId:          task.workerId!,
          buyerId:           task.buyerId,
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

      const buyer = await tx.user.findUnique({ where: { id: task.buyerId } })
      if (buyer?.role === 'BUYER') {
        await tx.buyerProfile.update({
          where: { userId: task.buyerId },
          data:  { totalSpentCents: { increment: task.rateCents } },
        })
      }

      await tx.taskEvent.create({
        data: {
          taskId,
          actor:    adminId,
          actorRole: 'ADMIN',
          action:   'admin_resolved',
          from:     'DISPUTED',
          to:       'APPROVED',
          note:     input.adminNotes,
        },
      })

      await tx.notification.create({
        data: {
          userId: task.workerId!,
          type:   'PAYMENT_RECEIVED',
          title:  'Dispute Resolved — Payment Approved',
          body:   `Your dispute for "${task.title}" was upheld. ₹${workerAmountCents / 100} will be credited.`,
          data:   { taskId },
        },
      })

      await tx.notification.create({
        data: {
          userId: task.buyerId,
          type:   'TASK_VERIFIED',
          title:  'Dispute Resolved',
          body:   `Admin resolved the dispute for "${task.title}" in the worker\'s favour.`,
          data:   { taskId },
        },
      })

      return { updatedTask, payoutId: payout.id }
    })

    await payoutQueue.add(PAYOUT_QUEUE, { payoutId }, { jobId: `payout_${payoutId}` })

    return updated
  } else {
    assertTransition(task.status, 'CANCELLED', 'SYSTEM')

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data:  { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: input.adminNotes },
      })

      if (task.workerId) {
        await tx.workerProfile.update({
          where: { userId: task.workerId },
          data:  { activeTaskId: null },
        })
      }

      await tx.taskEvent.create({
        data: {
          taskId,
          actor:    adminId,
          actorRole: 'ADMIN',
          action:   'admin_resolved',
          from:     'DISPUTED',
          to:       'CANCELLED',
          note:     input.adminNotes,
        },
      })

      if (task.workerId) {
        await tx.notification.create({
          data: {
            userId: task.workerId,
            type:   'TASK_REJECTED',
            title:  'Dispute Rejected',
            body:   `Your dispute for "${task.title}" was rejected: ${input.adminNotes}`,
            data:   { taskId },
          },
        })
      }

      await tx.notification.create({
        data: {
          userId: task.buyerId,
          type:   'TASK_REJECTED',
          title:  'Dispute Resolved — Work Not Approved',
          body:   `Admin reviewed the dispute for "${task.title}" and rejected the work.`,
          data:   { taskId },
        },
      })

      return updated
    })
  }
}

// ─── List users ────────────────────────────────────────────────────────────────

export async function listUsers(query: ListUsersQuery) {
  const where = query.role ? { role: query.role } : {}
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, isEmailVerified: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.user.count({ where }),
  ])
  return { users, total, page: query.page, limit: query.limit }
}

// ─── Deactivate user ───────────────────────────────────────────────────────────

export async function deactivateUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')

  return prisma.user.update({
    where:  { id: userId },
    data:   { isActive: false },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })
}

// ─── Activate user ─────────────────────────────────────────────────────────────

export async function activateUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')

  return prisma.user.update({
    where:  { id: userId },
    data:   { isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  })
}

// ─── Verify worker identity ────────────────────────────────────────────────────

export async function verifyUserIdentity(userId: string) {
  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { workerProfile: true },
  })
  if (!user) throw new NotFoundError('User not found')
  if (user.role !== 'WORKER') throw new BadRequestError('Identity verification is only for WORKER accounts')

  await prisma.workerProfile.update({
    where: { userId },
    data:  { identityVerified: true },
  })

  await prisma.notification.create({
    data: {
      userId,
      type:  'IDENTITY_VERIFIED',
      title: 'Identity Verified',
      body:  'Your identity has been verified by an admin. You can now accept higher-value tasks.',
      data:  { verified: true },
    },
  })

  return { userId, identityVerified: true }
}
