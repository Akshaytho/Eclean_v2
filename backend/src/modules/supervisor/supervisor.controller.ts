import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FlagTaskInput, SupervisorTasksQuery } from './supervisor.schema'
import * as svc from './supervisor.service'

export async function getSupervisorDashboard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.getSupervisorDashboard(req.user.id)
  await reply.send(result)
}

export async function getSupervisorTasks(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.getSupervisorTasks(req.user.id, req.query as SupervisorTasksQuery)
  await reply.send(result)
}

export async function flagTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const result = await svc.flagTask(id, req.user.id, req.body as FlagTaskInput)
  await reply.send(result)
}
