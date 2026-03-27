import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CreateReportInput, ListReportsQuery } from './citizen.schema'
import * as svc from './citizen.service'

export async function createReport(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const report = await svc.createReport(req.user.id, req.body as CreateReportInput)
  await reply.code(201).send(report)
}

export async function listReports(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.listCitizenReports(req.user.id, req.query as ListReportsQuery)
  await reply.send(result)
}
