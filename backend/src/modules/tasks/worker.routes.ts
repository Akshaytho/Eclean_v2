import type { FastifyInstance } from 'fastify'
import { authenticate, requireVerifiedEmail } from '../../middleware/authenticate'
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
  // Read-only routes don't require email verification
  const auth      = [authenticate, authorize(['WORKER'])]
  // Write routes (accept, start, submit, cancel) require verified email
  const authWrite = [authenticate, requireVerifiedEmail, authorize(['WORKER'])]

  // GET /api/v1/worker/tasks/open — READ
  fastify.get(
    '/tasks/open',
    { preHandler: [...auth, validate({ query: openTasksQuerySchema })] },
    ctrl.getOpenTasks,
  )

  // GET /api/v1/worker/my-tasks — READ
  fastify.get(
    '/my-tasks',
    { preHandler: [...auth, validate({ query: listTasksQuerySchema })] },
    ctrl.listWorkerTasks,
  )

  // GET /api/v1/worker/tasks/:taskId — READ
  fastify.get(
    '/tasks/:taskId',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getWorkerTask,
  )

  // POST /api/v1/worker/tasks/:taskId/accept — WRITE
  fastify.post(
    '/tasks/:taskId/accept',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema })] },
    ctrl.acceptTask,
  )

  // POST /api/v1/worker/tasks/:taskId/start — WRITE
  fastify.post(
    '/tasks/:taskId/start',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: startTaskSchema })] },
    ctrl.startTask,
  )

  // POST /api/v1/worker/tasks/:taskId/cancel — WRITE
  fastify.post(
    '/tasks/:taskId/cancel',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.cancelTaskAsWorker,
  )

  // POST /api/v1/worker/tasks/:taskId/submit — WRITE
  fastify.post(
    '/tasks/:taskId/submit',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema })] },
    ctrl.submitTask,
  )

  // POST /api/v1/worker/tasks/:taskId/retry — WRITE
  fastify.post(
    '/tasks/:taskId/retry',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema })] },
    ctrl.retryTask,
  )

  // POST /api/v1/worker/tasks/:taskId/dispute — WRITE
  fastify.post(
    '/tasks/:taskId/dispute',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.disputeTask,
  )

  // POST /api/v1/worker/tasks/:taskId/location — location updates don't need email verify
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

  // GET /api/v1/worker/tasks/:taskId/chat — READ
  fastify.get(
    '/tasks/:taskId/chat',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getChatHistory,
  )
}
