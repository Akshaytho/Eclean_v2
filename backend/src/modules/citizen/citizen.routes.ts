import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { createReportSchema, listReportsQuerySchema } from './citizen.schema'
import * as ctrl from './citizen.controller'

export async function citizenRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [authenticate, authorize(['CITIZEN'])]

  // POST /api/v1/citizen/reports
  fastify.post(
    '/reports',
    {
      preHandler: [...auth, validate({ body: createReportSchema })],
    },
    ctrl.createReport,
  )

  // GET /api/v1/citizen/reports — own reports only
  fastify.get(
    '/reports',
    {
      preHandler: [...auth, validate({ query: listReportsQuerySchema })],
    },
    ctrl.listReports,
  )
}
