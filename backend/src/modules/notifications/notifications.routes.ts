import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import {
  deviceTokenBodySchema,
  notifListQuerySchema,
  notifIdParamSchema,
  type DeviceTokenBody,
  type NotifListQuery,
  type NotifIdParam,
} from './notifications.schema'
import * as notifService from './notifications.service'

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/notifications/device-token  — save FCM token
  fastify.post<{ Body: DeviceTokenBody }>(
    '/device-token',
    { preHandler: [authenticate, validate({ body: deviceTokenBodySchema })] },
    async (request, reply) => {
      await notifService.saveDeviceToken(request.user.id, request.body.token)
      return reply.status(200).send({ success: true })
    },
  )

  // GET /api/v1/notifications?page=  — own notifications + unread count
  fastify.get<{ Querystring: NotifListQuery }>(
    '/',
    { preHandler: [authenticate, validate({ query: notifListQuerySchema })] },
    async (request, reply) => {
      const result = await notifService.getNotifications(request.user.id, request.query.page)
      return reply.send(result)
    },
  )

  // POST /api/v1/notifications/read-all  — mark everything read
  // Must be registered BEFORE /:id/read so Fastify prefers the static path
  fastify.post(
    '/read-all',
    { preHandler: [authenticate] },
    async (request, reply) => {
      await notifService.markAllRead(request.user.id)
      return reply.status(200).send({ success: true })
    },
  )

  // POST /api/v1/notifications/:id/read  — mark one notification read
  fastify.post<{ Params: NotifIdParam }>(
    '/:id/read',
    { preHandler: [authenticate, validate({ params: notifIdParamSchema })] },
    async (request, reply) => {
      await notifService.markOneRead(request.user.id, request.params.id)
      return reply.status(200).send({ success: true })
    },
  )
}
