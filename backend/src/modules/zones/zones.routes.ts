import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import {
  createZoneSchema,
  inspectZoneSchema,
  listZonesQuerySchema,
  zoneIdParamSchema,
} from './zones.schema'
import * as ctrl from './zones.controller'

export async function zoneRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/zones — ADMIN only
  fastify.post(
    '/',
    {
      preHandler: [
        authenticate,
        authorize(['ADMIN']),
        validate({ body: createZoneSchema }),
      ],
    },
    ctrl.createZone,
  )

  // GET /api/v1/zones?city= — any authenticated user
  fastify.get(
    '/',
    {
      preHandler: [
        authenticate,
        validate({ query: listZonesQuerySchema }),
      ],
    },
    ctrl.listZones,
  )

  // PATCH /api/v1/zones/:id/inspect — SUPERVISOR only
  fastify.patch(
    '/:id/inspect',
    {
      preHandler: [
        authenticate,
        authorize(['SUPERVISOR']),
        validate({ params: zoneIdParamSchema, body: inspectZoneSchema }),
      ],
    },
    ctrl.inspectZone,
  )
}
