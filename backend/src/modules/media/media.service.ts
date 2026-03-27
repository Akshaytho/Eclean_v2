import { Readable } from 'stream'
import type { UploadApiResponse } from 'cloudinary'
import { cloudinary, assertCloudinaryConfigured } from '../../lib/cloudinary'
import { prisma } from '../../lib/prisma'
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../lib/errors'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type TaskMediaType,
} from './media.schema'

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadTaskMedia(params: {
  userId:    string
  userRole:  string
  taskId:    string
  mediaType: TaskMediaType
  file:      Buffer
  mimeType:  string
  sizeBytes: number
}) {
  const { userId, userRole, taskId, mediaType, file, mimeType, sizeBytes } = params

  // Validate file type
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new BadRequestError('Only JPEG, PNG, and WEBP images are allowed')
  }

  // Validate file size
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new BadRequestError('File size must not exceed 10 MB')
  }

  // Fetch task
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Permission checks
  if (mediaType === 'REFERENCE') {
    if (userRole !== 'BUYER' || task.buyerId !== userId) {
      throw new ForbiddenError('Only the task buyer can upload REFERENCE photos')
    }
  } else {
    // BEFORE, AFTER, PROOF — assigned worker only, task must be IN_PROGRESS
    if (userRole !== 'WORKER') throw new ForbiddenError('Only workers can upload work photos')
    if (task.workerId !== userId) throw new ForbiddenError('Not your task')
    if (task.status !== 'IN_PROGRESS') {
      throw new BadRequestError('Work photos can only be uploaded while task is IN_PROGRESS')
    }

  }

  // Deduplication — delete existing media of same type for this task
  const existing = await prisma.taskMedia.findFirst({
    where: { taskId, type: mediaType as never },
  })
  if (existing) {
    if (existing.publicId) {
      await cloudinary.uploader.destroy(existing.publicId)
    }
    await prisma.taskMedia.delete({ where: { id: existing.id } })
  }

  // Guard — ensure Cloudinary is configured before attempting upload
  assertCloudinaryConfigured()

  // Upload to Cloudinary via upload_stream (memory-efficient)
  const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:         `eclean/tasks/${taskId}`,
        resource_type:  'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) reject(error ?? new Error('Cloudinary upload failed'))
        else resolve(result)
      },
    )
    Readable.from(file).pipe(stream)
  })

  // Save to DB
  const media = await prisma.taskMedia.create({
    data: {
      taskId,
      url:       uploadResult.secure_url,
      publicId:  uploadResult.public_id,
      mimeType,
      sizeBytes,
      type:      mediaType as never,
    },
  })

  return media
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function getTaskMedia(userId: string, userRole: string, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Access: buyer, assigned worker, supervisor, admin
  const isAllowed =
    task.buyerId === userId ||
    task.workerId === userId ||
    userRole === 'SUPERVISOR' ||
    userRole === 'ADMIN'

  if (!isAllowed) throw new ForbiddenError('Access denied')

  return prisma.taskMedia.findMany({
    where:   { taskId },
    orderBy: { createdAt: 'asc' },
  })
}
