import { prisma } from '../../lib/prisma'
import { NotFoundError, ForbiddenError } from '../../lib/errors'
import type { FlagTaskInput, SupervisorTasksQuery } from './supervisor.schema'

// ─── Dashboard: zones assigned to supervisor + active tasks ───────────────────

export async function getSupervisorDashboard(supervisorId: string) {
  const zones = await prisma.zone.findMany({
    where: { supervisorId },
    include: {
      tasks: {
        where: { status: { in: ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'] } },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return { zones }
}

// ─── IN_PROGRESS tasks in supervisor zones + GPS logs ─────────────────────────

export async function getSupervisorTasks(supervisorId: string, query: SupervisorTasksQuery) {
  const zones = await prisma.zone.findMany({
    where:  { supervisorId },
    select: { id: true },
  })
  const zoneIds = zones.map(z => z.id)

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where: {
        zoneId: { in: zoneIds },
        status: 'IN_PROGRESS',
      },
      include: {
        locationLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
        worker:       { select: { id: true, name: true, phone: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.task.count({
      where: { zoneId: { in: zoneIds }, status: 'IN_PROGRESS' },
    }),
  ])

  return { tasks, total, page: query.page, limit: query.limit }
}

// ─── Flag a task — creates TaskEvent, notifies all ADMINs ─────────────────────

export async function flagTask(
  taskId: string,
  supervisorId: string,
  input: FlagTaskInput,
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Verify the task belongs to one of this supervisor's zones
  if (task.zoneId) {
    const zone = await prisma.zone.findFirst({ where: { id: task.zoneId, supervisorId } })
    if (!zone) throw new ForbiddenError('Task is not in your zones')
  }

  // Flag does not change status — record event with from === to
  await prisma.taskEvent.create({
    data: {
      taskId,
      actor:    supervisorId,
      actorRole: 'SUPERVISOR',
      action:   'flagged_by_supervisor',
      from:     task.status,
      to:       task.status,
      note:     input.reason,
    },
  })

  // Notify all active ADMINs
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
  })

  await Promise.all(
    admins.map(a =>
      prisma.notification.create({
        data: {
          userId: a.id,
          type:   'TASK_FLAGGED',
          title:  'Task Flagged by Supervisor',
          body:   `Task "${task.title}" has been flagged: ${input.reason}`,
          data:   { taskId, reason: input.reason },
        },
      }),
    ),
  )

  return { taskId, flagged: true }
}
