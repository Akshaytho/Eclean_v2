import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
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
  const auth = [authenticate, authorize(['BUYER'])]

  // POST /api/v1/buyer/tasks
  fastify.post(
    '/',
    { preHandler: [...auth, validate({ body: createTaskSchema })] },
    ctrl.createTask,
  )

  // GET /api/v1/buyer/tasks
  fastify.get(
    '/',
    { preHandler: [...auth, validate({ query: listTasksQuerySchema })] },
    ctrl.listBuyerTasks,
  )

  // GET /api/v1/buyer/tasks/:taskId
  fastify.get(
    '/:taskId',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getBuyerTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/cancel
  fastify.post(
    '/:taskId/cancel',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.cancelTaskAsBuyer,
  )

  // POST /api/v1/buyer/tasks/:taskId/approve
  fastify.post(
    '/:taskId/approve',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.approveTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/reject
  fastify.post(
    '/:taskId/reject',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: reasonSchema })] },
    ctrl.rejectTask,
  )

  // POST /api/v1/buyer/tasks/:taskId/rate
  fastify.post(
    '/:taskId/rate',
    { preHandler: [...auth, validate({ params: taskIdParamSchema, body: rateTaskSchema })] },
    ctrl.rateTask,
  )

  // GET /api/v1/buyer/tasks/:taskId/chat
  fastify.get(
    '/:taskId/chat',
    { preHandler: [...auth, validate({ params: taskIdParamSchema })] },
    ctrl.getChatHistory,
  )
}
