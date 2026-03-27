import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { BadRequestError } from '../../lib/errors'
import { uploadTaskMedia, getTaskMedia } from './media.service'
import { emitTaskPhotoAdded } from '../../realtime/socket'
import {
  uploadMediaFieldSchema,
  taskIdParamSchema,
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
        }
      }

      if (!fileBuffer) throw new BadRequestError('No file provided')
      if (!mediaType)  throw new BadRequestError('mediaType field is required')

      // Validate mediaType field value
      const parsed = uploadMediaFieldSchema.safeParse({ mediaType })
      if (!parsed.success) {
        throw new BadRequestError(
          `mediaType must be one of: ${TASK_MEDIA_TYPES.join(', ')}`,
        )
      }

      const media = await uploadTaskMedia({
        userId:    request.user.id,
        userRole:  request.user.role,
        taskId,
        mediaType: parsed.data.mediaType,
        file:      fileBuffer,
        mimeType,
        sizeBytes,
      })

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
