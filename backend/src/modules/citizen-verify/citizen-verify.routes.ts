import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { getVerifyTasksNearCitizen, submitCitizenVerification } from './citizen-verify.service'

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(5).optional(),
})

const verifyParamSchema = z.object({
  taskId: z.string().uuid(),
})

const verifyBodySchema = z.object({
  rating: z.enum(['CLEAN', 'PARTIALLY_CLEAN', 'DIRTY']),
  photoUrl: z.string().url().optional(),
  photoPublicId: z.string().optional(),
  capturedLat: z.number().min(-90).max(90).optional(),
  capturedLng: z.number().min(-180).max(180).optional(),
})

export async function citizenVerifyRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /api/v1/citizen/verify-tasks?lat=&lng=&radiusKm=
  fastify.get(
    '/verify-tasks',
    {
      preHandler: [
        authenticate,
        authorize(['CITIZEN']),
      ],
    },
    async (request, reply) => {
      const parsed = nearbyQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({ error: { message: 'lat and lng are required' } })
      }
      const tasks = await getVerifyTasksNearCitizen(
        request.user.id,
        parsed.data.lat,
        parsed.data.lng,
        parsed.data.radiusKm,
      )
      return reply.send({ tasks })
    },
  )

  // POST /api/v1/citizen/verify/:taskId
  fastify.post(
    '/verify/:taskId',
    {
      preHandler: [
        authenticate,
        authorize(['CITIZEN']),
        validate({ params: verifyParamSchema, body: verifyBodySchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as z.infer<typeof verifyBodySchema>

      const result = await submitCitizenVerification({
        taskId,
        citizenId: request.user.id,
        rating: body.rating,
        photoUrl: body.photoUrl,
        photoPublicId: body.photoPublicId,
        citizenLat: body.capturedLat,
        citizenLng: body.capturedLng,
      })

      return reply.status(201).send(result)
    },
  )
}
