import type { FastifyInstance } from 'fastify'
import { authenticate, requireVerifiedEmail } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import {
  createTaskSchema,
  reasonSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  rateTaskSchema,
} from './tasks.schema'
import * as ctrl from './tasks.controller'

export async function buyerRoutes(fastify: FastifyInstance): Promise<void> {
  // Read-only routes don't require email verification (don't lock out existing users)
  const auth      = [authenticate, authorize(['BUYER'])]
  // Write routes (money, tasks, reviews) require verified email
  const authWrite = [authenticate, requireVerifiedEmail, authorize(['BUYER'])]

  // POST /api/v1/buyer/tasks — WRITE (creates task + payment)
  fastify.post(
    '/',
    { preHandler: [...authWrite, validate({ body: createTaskSchema })] },
    ctrl.createTask,
  )

  // GET /api/v1/buyer/tasks — READ
  fastify.get(
    '/',
    { preHandler: [...auth, validate({ query: listTasksQuerySchema })] },
    ctrl.listBuyerTasks,
  )

  // GET /api/v1/buyer/tasks/:taskId — READ
  fastify.get(
    '/:taskId',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getBuyerTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/cancel — WRITE
  fastify.post(
    '/:taskId/cancel',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.cancelTaskAsBuyer,
  )

  // POST /api/v1/buyer/tasks/:taskId/approve — WRITE (releases payment)
  fastify.post(
    '/:taskId/approve',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema })] },
    ctrl.approveTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/reject — WRITE
  fastify.post(
    '/:taskId/reject',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.rejectTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/rate — WRITE
  fastify.post(
    '/:taskId/rate',
    { preHandler: [...authWrite, validate({ params: taskIdParamSchema, body: rateTaskSchema })] },
    ctrl.rateTask,
  )

  // GET /api/v1/buyer/tasks/:taskId/chat — READ
  fastify.get(
    '/:taskId/chat',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getChatHistory,
  )
}
