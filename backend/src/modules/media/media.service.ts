import { Readable } from 'stream'
import type { UploadApiResponse } from 'cloudinary'
import { cloudinary, assertCloudinaryConfigured } from '../../lib/cloudinary'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../../lib/errors'
import { extractExif, computePhotoDistance } from '../../lib/exif'
import { logMediaEvent } from '../../lib/event-log'
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
  idempotencyKey?: string | null
  deviceMeta?: {
    capturedLat: number | null
    capturedLng: number | null
    capturedAt:  string | null
    deviceId:    string | null
    photoHash:   string | null
  }
}) {
  const { userId, userRole, taskId, mediaType, file, mimeType, sizeBytes, idempotencyKey, deviceMeta } = params

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

  // ── EXIF extraction (BEFORE Cloudinary upload) ──────────────────────────────
  // Cloudinary strips EXIF on upload. This is the ONLY chance to capture
  // GPS coordinates, timestamp, and device info from the photo itself.
  // Fire-and-forget — EXIF failure must never block the upload.
  const exif = await extractExif(file)

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
      url:            uploadResult.secure_url,
      publicId:       uploadResult.public_id,
      mimeType,
      sizeBytes,
      type:           mediaType as never,
      idempotencyKey: idempotencyKey ?? undefined,
    },
  })

  // ── Write analytics (fire-and-forget) ────────────────────────────────────────
  // Device metadata from phone is MORE RELIABLE than EXIF (which gets stripped
  // by expo-image-manipulator compression). Use device meta as primary source,
  // EXIF as fallback.
  const bestLat = deviceMeta?.capturedLat ?? exif.lat
  const bestLng = deviceMeta?.capturedLng ?? exif.lng

  const { distanceMeters, isFlagged, flagReason } = computePhotoDistance(
    bestLat, bestLng, task.locationLat, task.locationLng,
  )

  void prisma.analyticsPhotoMeta.create({
    data: {
      mediaId:                media.id,
      taskId,
      uploaderId:             userId,
      uploaderRole:           userRole,
      mediaType,
      // EXIF data (may be null after compression)
      exifLat:                exif.lat,
      exifLng:                exif.lng,
      exifTimestamp:           exif.timestamp,
      exifAltitude:           exif.altitude,
      deviceMake:             exif.make,
      deviceModel:            exif.model,
      imageWidth:             exif.imageWidth,
      imageHeight:            exif.imageHeight,
      // Device-captured metadata from phone (reliable — from expo-location)
      capturedLat:            deviceMeta?.capturedLat ?? null,
      capturedLng:            deviceMeta?.capturedLng ?? null,
      capturedAt:             deviceMeta?.capturedAt ? new Date(deviceMeta.capturedAt) : null,
      capturedDeviceId:       deviceMeta?.deviceId ?? null,
      photoHash:              deviceMeta?.photoHash ?? null,
      // Fraud detection — uses best available GPS
      taskLat:                task.locationLat,
      taskLng:                task.locationLng,
      distanceFromTaskMeters: distanceMeters,
      isFlagged,
      flagReason,
    },
  }).catch((writeErr: unknown) => {
    logger.error({ err: writeErr, mediaId: media.id }, 'AnalyticsPhotoMeta write failed (non-fatal)')
  })

  logMediaEvent(media.id, 'uploaded', userId, userRole, {
    taskId,
    mediaType,
    mimeType,
    sizeBytes,
    url: uploadResult.secure_url,
    gps: bestLat !== null ? { lat: bestLat, lng: bestLng, source: deviceMeta?.capturedLat ? 'device' : 'exif' } : null,
    device: deviceMeta?.deviceId ?? exif.model,
    photoHash: deviceMeta?.photoHash ?? null,
    isFlagged,
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
