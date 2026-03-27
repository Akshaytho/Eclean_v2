import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import {
  reasonSchema,
  locationUpdateSchema,
  startTaskSchema,
  listTasksQuerySchema,
  openTasksQuerySchema,
  taskIdParamSchema,
} from './tasks.schema'
import * as ctrl from './tasks.controller'

export async function workerRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [authenticate, authorize(['WORKER'])]

  // GET /api/v1/worker/tasks/open
  fastify.get(
    '/tasks/open',
    { preHandler: [...auth, validate({ query: openTasksQuerySchema })] },
    ctrl.getOpenTasks,
  )

  // GET /api/v1/worker/my-tasks
  fastify.get(
    '/my-tasks',
    { preHandler: [...auth, validate({ query: listTasksQuerySchema })] },
    ctrl.listWorkerTasks,
  )

  // GET /api/v1/worker/tasks/:taskId
  fastify.get(
    '/tasks/:taskId',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getWorkerTask,
  )

  // POST /api/v1/worker/tasks/:taskId/accept
  fastify.post(
    '/tasks/:taskId/accept',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.acceptTask,
  )

  // POST /api/v1/worker/tasks/:taskId/start
  // Body { lat, lng } is optional — used for geofence check when task has a location
  fastify.post(
    '/tasks/:taskId/start',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: startTaskSchema })] },
    ctrl.startTask,
  )

  // POST /api/v1/worker/tasks/:taskId/cancel
  fastify.post(
    '/tasks/:taskId/cancel',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.cancelTaskAsWorker,
  )

  // POST /api/v1/worker/tasks/:taskId/submit
  fastify.post(
    '/tasks/:taskId/submit',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.submitTask,
  )

  // POST /api/v1/worker/tasks/:taskId/retry
  fastify.post(
    '/tasks/:taskId/retry',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.retryTask,
  )

  // POST /api/v1/worker/tasks/:taskId/dispute
  fastify.post(
    '/tasks/:taskId/dispute',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.disputeTask,
  )

  // POST /api/v1/worker/tasks/:taskId/location
  fastify.post(
    '/tasks/:taskId/location',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: locationUpdateSchema })] },
    ctrl.updateLocation,
  )


  // PATCH /api/v1/worker/availability — toggle online/busy status
  fastify.patch(
    '/availability',
    { preHandler: auth },
    ctrl.updateAvailability,
  )
  // GET /api/v1/worker/tasks/:taskId/chat
  fastify.get(
    '/tasks/:taskId/chat',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getChatHistory,
  )
}
