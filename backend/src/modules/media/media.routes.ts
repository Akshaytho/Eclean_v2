import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { BadRequestError } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { uploadTaskMedia, getTaskMedia } from './media.service'
import { emitTaskPhotoAdded } from '../../realtime/socket'
import {
  uploadMediaFieldSchema,
  taskIdParamSchema,
  deviceMetaSchema,
  TASK_MEDIA_TYPES,
  MAX_FILE_SIZE_BYTES,
} from './media.schema'

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/tasks/:taskId/media  (multipart/form-data)
  fastify.post(
    '/:taskId/media',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER', 'WORKER']),
        validate({ params: taskIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }

      const parts = request.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } })

      let fileBuffer: Buffer | null = null
      let mimeType   = ''
      let sizeBytes  = 0
      let mediaType: string | null = null

      // Device-captured metadata (supplements EXIF which may be stripped by compression)
      let capturedLat: number | null = null
      let capturedLng: number | null = null
      let capturedAt:  string | null = null
      let deviceId:    string | null = null
      let photoHash:   string | null = null

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = []
          for await (const chunk of part.file) {
            chunks.push(chunk)
          }
          fileBuffer = Buffer.concat(chunks)
          mimeType   = part.mimetype
          sizeBytes  = fileBuffer.length
        } else if (part.fieldname === 'mediaType') {
          mediaType = part.value as string
        } else if (part.fieldname === 'capturedLat') {
          const v = parseFloat(part.value as string)
          if (!isNaN(v)) capturedLat = v
        } else if (part.fieldname === 'capturedLng') {
          const v = parseFloat(part.value as string)
          if (!isNaN(v)) capturedLng = v
        } else if (part.fieldname === 'capturedAt') {
          capturedAt = part.value as string
        } else if (part.fieldname === 'deviceId') {
          deviceId = part.value as string
        } else if (part.fieldname === 'photoHash') {
          photoHash = part.value as string
        }
      }

      if (!fileBuffer) throw new BadRequestError('No file provided')
      if (!mediaType)  throw new BadRequestError('mediaType field is required')

      // SECURITY: validate device metadata with Zod (bounds-check coordinates, cap string lengths)
      const metaParsed = deviceMetaSchema.safeParse({ capturedLat, capturedLng, capturedAt, deviceId, photoHash })
      if (!metaParsed.success) {
        throw new BadRequestError('Invalid device metadata: ' + metaParsed.error.issues[0]?.message)
      }
      ;({ capturedLat, capturedLng, capturedAt, deviceId, photoHash } = metaParsed.data)

      // Idempotency: if client sends same key twice, return existing record
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined
      if (idempotencyKey) {
        const existing = await prisma.taskMedia.findUnique({ where: { idempotencyKey } })
        if (existing) {
          return reply.status(200).send({ media: existing, duplicate: true })
        }
      }

      // Validate mediaType field value
      const parsed = uploadMediaFieldSchema.safeParse({ mediaType })
      if (!parsed.success) {
        throw new BadRequestError(
          `mediaType must be one of: ${TASK_MEDIA_TYPES.join(', ')}`,
        )
      }

      let media
      try {
        media = await uploadTaskMedia({
          userId:    request.user.id,
          userRole:  request.user.role,
          taskId,
          mediaType: parsed.data.mediaType,
          file:      fileBuffer,
          mimeType,
          sizeBytes,
          idempotencyKey: idempotencyKey ?? null,
          deviceMeta: {
            capturedLat,
          capturedLng,
          capturedAt,
          deviceId,
          photoHash,
        },
      })
      } catch (err: any) {
        // PERF: Catch unique constraint violation from race condition on idempotency key.
        // Two identical requests can pass the findUnique check simultaneously,
        // both upload to Cloudinary, and the second create fails here.
        if (err?.code === 'P2002' && idempotencyKey) {
          const existing = await prisma.taskMedia.findUnique({ where: { idempotencyKey } })
          if (existing) return reply.status(200).send({ media: existing, duplicate: true })
        }
        throw err
      }

      emitTaskPhotoAdded(taskId, media)

      return reply.status(201).send({ media })
    },
  )

  // GET /api/v1/tasks/:taskId/media
  fastify.get(
    '/:taskId/media',
    {
      preHandler: [
        authenticate,
        authorize(['BUYER', 'WORKER', 'SUPERVISOR', 'ADMIN']),
        validate({ params: taskIdParamSchema }),
      ],
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const media = await getTaskMedia(request.user.id, request.user.role, taskId)
      return reply.send({ media })
    },
  )
}
