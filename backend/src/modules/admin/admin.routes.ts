import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import {
  convertToTaskSchema,
  resolveDisputeSchema,
  listUsersQuerySchema,
  listDisputesQuerySchema,
  reportIdParamSchema,
  userIdParamSchema,
  taskIdParamSchema,
} from './admin.schema'
import * as ctrl from './admin.controller'

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [authenticate, authorize(['ADMIN'])]

  // POST /api/v1/admin/reports/:id/convert-to-task
  fastify.post(
    '/reports/:id/convert-to-task',
    {
      preHandler: [...auth, validate({ params: reportIdParamSchema, body: convertToTaskSchema })],
    },
    ctrl.convertReportToTask,
  )

  // GET /api/v1/admin/dashboard
  fastify.get('/dashboard', { preHandler: auth }, ctrl.getAdminDashboard)

  // GET /api/v1/admin/disputes?page=
  fastify.get(
    '/disputes',
    {
      preHandler: [...auth, validate({ query: listDisputesQuerySchema })],
    },
    ctrl.listDisputes,
  )

  // POST /api/v1/admin/disputes/:taskId/resolve
  fastify.post(
    '/disputes/:taskId/resolve',
    {
      preHandler: [...auth, validate({ params: taskIdParamSchema, body: resolveDisputeSchema })],
    },
    ctrl.resolveDispute,
  )

  // GET /api/v1/admin/payouts?page=
  fastify.get(
    '/payouts',
    {
      preHandler: [...auth, validate({ query: listUsersQuerySchema })],
    },
    ctrl.listPayouts,
  )

  // GET /api/v1/admin/users?role=&page=
  fastify.get(
    '/users',
    {
      preHandler: [...auth, validate({ query: listUsersQuerySchema })],
    },
    ctrl.listUsers,
  )

  // POST /api/v1/admin/users/:id/deactivate
  fastify.post(
    '/users/:id/deactivate',
    {
      preHandler: [...auth, validate({ params: userIdParamSchema })],
    },
    ctrl.deactivateUser,
  )

  // POST /api/v1/admin/users/:id/activate
  fastify.post(
    '/users/:id/activate',
    {
      preHandler: [...auth, validate({ params: userIdParamSchema })],
    },
    ctrl.activateUser,
  )

  // POST /api/v1/admin/users/:id/verify-identity
  fastify.post(
    '/users/:id/verify-identity',
    {
      preHandler: [...auth, validate({ params: userIdParamSchema })],
    },
    ctrl.verifyUserIdentity,
  )
}
