import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import {
  saveBuyerEnvironment,
  saveWorkerEnvironment,
} from './environment.service'

const taskIdParamSchema = z.object({
  taskId: z.string().uuid(),
})

const environmentBodySchema = z.object({
  captureType: z.enum(['BUYER_CREATION', 'WORKER_START', 'WORKER_PHOTO', 'WORKER_SUBMIT']),
  magX: z.number().optional(),
  magY: z.number().optional(),
  magZ: z.number().optional(),
  barometer: z.number().optional(),
  ambientLight: z.number().optional(),
  cellType: z.string().optional(),
  cellCarrier: z.string().optional(),
  wifiNetworks: z.string().optional(), // JSON string
  capturedAt: z.string(),
})

const motionBodySchema = z.object({
  cleaningPct: z.number().min(0).max(1),
  walkingPct: z.number().min(0).max(1),
  standingPct: z.number().min(0).max(1),
  vehiclePct: z.number().min(0).max(1),
  totalWindows: z.number().int().min(0),
  durationSecs: z.number().int().min(0),
})

export async function environmentRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/v1/tasks/:taskId/environment
  fastify.post(
    '/:taskId/environment',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER', 'WORKER']),
        validate({ params: taskIdParamSchema, body: environmentBodySchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as z.infer<typeof environmentBodySchema>

      if (body.captureType === 'BUYER_CREATION') {
        const result = await saveBuyerEnvironment(taskId, request.user.id, body)
        return reply.status(201).send({ id: result.id, matchScore: null })
      }

      // Worker captures
      const captureType = body.captureType === 'WORKER_START' ? 'START'
        : body.captureType === 'WORKER_PHOTO' ? 'PHOTO'
        : 'SUBMIT'

      const result = await saveWorkerEnvironment(taskId, request.user.id, captureType, body)
      return reply.status(201).send({ id: result.id, matchScore: result.matchScore })
    },
  )

  // POST /api/v1/tasks/:taskId/motion-summary
  fastify.post(
    '/:taskId/motion-summary',
    {
      preHandler: [
        authenticate,
        authorize(['WORKER']),
        validate({ params: taskIdParamSchema, body: motionBodySchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as z.infer<typeof motionBodySchema>

      const { prisma } = await import('../../lib/prisma')

      // Upsert motion summary
      const result = await prisma.taskMotionSummary.upsert({
        where: { taskId },
        update: {
          cleaningPct: body.cleaningPct,
          walkingPct: body.walkingPct,
          standingPct: body.standingPct,
          vehiclePct: body.vehiclePct,
          totalWindows: body.totalWindows,
          durationSecs: body.durationSecs,
          hasRedFlag: body.vehiclePct > 0.3 || body.standingPct > 0.7,
          hasYellowFlag: body.standingPct > 0.4 || body.cleaningPct < 0.3,
        },
        create: {
          taskId,
          workerId: request.user.id,
          cleaningPct: body.cleaningPct,
          walkingPct: body.walkingPct,
          standingPct: body.standingPct,
          vehiclePct: body.vehiclePct,
          totalWindows: body.totalWindows,
          durationSecs: body.durationSecs,
          hasRedFlag: body.vehiclePct > 0.3 || body.standingPct > 0.7,
          hasYellowFlag: body.standingPct > 0.4 || body.cleaningPct < 0.3,
        },
      })

      return reply.status(201).send({
        id: result.id,
        hasRedFlag: result.hasRedFlag,
        hasYellowFlag: result.hasYellowFlag,
      })
    },
  )
}
