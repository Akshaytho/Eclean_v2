import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { BadRequestError } from '../../lib/errors'
import {
  addReferencePoint,
  listReferencePoints,
  deleteReferencePoint,
} from './reference-points.service'
import {
  submitPointPhoto,
  getSubmissionProgress,
} from './worker-submission.service'
import {
  taskIdParamSchema,
  pointIdParamSchema,
  pointSubmitParamSchema,
  addReferencePointFieldSchema,
  submitPointFieldSchema,
  progressQuerySchema,
} from './reference-points.schema'
import { MAX_FILE_SIZE_BYTES } from '../media/media.schema'

export async function referencePointRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── Buyer: upload reference point ─────────────────────────────────────────

  // POST /api/v1/tasks/:taskId/reference-points
  fastify.post(
    '/:taskId/reference-points',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER']),
        validate({ params: taskIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }

      const parts = request.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })

      let fileBuffer: Buffer | null = null
      let mimeType = ''
      let sizeBytes = 0
      const fields: Record<string, string> = {}

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = []
          for await (const chunk of part.file) {
            chunks.push(chunk)
          }
          fileBuffer = Buffer.concat(chunks)
          mimeType = part.mimetype
          sizeBytes = fileBuffer.length
        } else {
          fields[part.fieldname] = part.value as string
        }
      }

      if (!fileBuffer) throw new BadRequestError('No file provided')

      const parsed = addReferencePointFieldSchema.safeParse(fields)
      if (!parsed.success) {
        throw new BadRequestError(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
      }

      const idempotencyKey = request.headers['idempotency-key'] as string | undefined

      const referencePoint = await addReferencePoint({
        taskId,
        buyerId: request.user.id,
        pointIndex: parsed.data.pointIndex,
        label: parsed.data.label,
        file: fileBuffer,
        mimeType,
        sizeBytes,
        idempotencyKey,
        deviceMeta: {
          capturedLat: parsed.data.capturedLat,
          capturedLng: parsed.data.capturedLng,
          capturedAt: parsed.data.capturedAt,
          photoHash: parsed.data.photoHash,
        },
      })

      return reply.status(201).send({ referencePoint })
    },
  )

  // ─── Buyer/Worker: list reference points ───────────────────────────────────

  // GET /api/v1/tasks/:taskId/reference-points
  fastify.get(
    '/:taskId/reference-points',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER', 'WORKER', 'SUPERVISOR', 'ADMIN']),
        validate({ params: taskIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const result = await listReferencePoints(taskId, request.user.id, request.user.role)
      return reply.send(result)
    },
  )

  // ─── Buyer: delete reference point ─────────────────────────────────────────

  // DELETE /api/v1/tasks/:taskId/reference-points/:pointId
  fastify.delete(
    '/:taskId/reference-points/:pointId',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER']),
        validate({ params: pointIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId, pointId } = request.params as { taskId: string; pointId: string }
      const result = await deleteReferencePoint(taskId, pointId, request.user.id)
      return reply.send(result)
    },
  )

  // ─── Worker: submit photo for a reference point ────────────────────────────

  // POST /api/v1/tasks/:taskId/points/:pointId/submit
  fastify.post(
    '/:taskId/points/:pointId/submit',
    {
      preHandler: [
        authenticate,
        authorize(['WORKER']),
        validate({ params: pointSubmitParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId, pointId } = request.params as { taskId: string; pointId: string }

      const parts = request.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })

      let fileBuffer: Buffer | null = null
      let mimeType = ''
      let sizeBytes = 0
      const fields: Record<string, string> = {}

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = []
          for await (const chunk of part.file) {
            chunks.push(chunk)
          }
          fileBuffer = Buffer.concat(chunks)
          mimeType = part.mimetype
          sizeBytes = fileBuffer.length
        } else {
          fields[part.fieldname] = part.value as string
        }
      }

      if (!fileBuffer) throw new BadRequestError('No file provided')

      const parsed = submitPointFieldSchema.safeParse(fields)
      if (!parsed.success) {
        throw new BadRequestError(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
      }

      const idempotencyKey = request.headers['idempotency-key'] as string | undefined

      const submission = await submitPointPhoto({
        taskId,
        referencePointId: pointId,
        workerId: request.user.id,
        mediaType: parsed.data.mediaType,
        file: fileBuffer,
        mimeType,
        sizeBytes,
        idempotencyKey,
        deviceMeta: {
          capturedLat: parsed.data.capturedLat,
          capturedLng: parsed.data.capturedLng,
          capturedAt: parsed.data.capturedAt,
          deviceId: parsed.data.deviceId,
          photoHash: parsed.data.photoHash,
        },
      })

      return reply.status(201).send({ submission })
    },
  )

  // ─── Worker: get submission progress ───────────────────────────────────────

  // GET /api/v1/tasks/:taskId/submission-progress
  fastify.get(
    '/:taskId/submission-progress',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER', 'WORKER', 'SUPERVISOR', 'ADMIN']),
        validate({ params: taskIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const query = progressQuerySchema.safeParse(request.query)
      const workerLat = query.success ? query.data.workerLat : undefined
      const workerLng = query.success ? query.data.workerLng : undefined

      const progress = await getSubmissionProgress(
        taskId, request.user.id, request.user.role, workerLat, workerLng,
      )
      return reply.send(progress)
    },
  )
}
