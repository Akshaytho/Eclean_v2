import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { flagTaskSchema, taskIdParamSchema, supervisorTasksQuerySchema } from './supervisor.schema'
import * as ctrl from './supervisor.controller'

export async function supervisorRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = [authenticate, authorize(['SUPERVISOR'])]

  // GET /api/v1/supervisor/dashboard
  fastify.get('/dashboard', { preHandler: auth }, ctrl.getSupervisorDashboard)

  // GET /api/v1/supervisor/tasks
  fastify.get(
    '/tasks',
    { preHandler: [...auth, validate({ query: supervisorTasksQuerySchema })] },
    ctrl.getSupervisorTasks,
  )

  // POST /api/v1/supervisor/tasks/:id/flag
  fastify.post(
    '/tasks/:id/flag',
    {
      preHandler: [
        ...auth,
        validate({ params: taskIdParamSchema, body: flagTaskSchema }),
      ],
    },
    ctrl.flagTask,
  )
}
