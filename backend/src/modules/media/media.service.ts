import { Readable } from 'stream'
import crypto from 'crypto'

// SECURITY: validate image magic bytes without external deps (zero overhead, no npm install)
// JPEG: FF D8 FF | PNG: 89 50 4E 47 | WEBP: 52 49 46 46 ...57 45 42 50
function isValidImageMagicBytes(buf: Buffer): boolean {
  if (buf.length < 12) return false
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true
  // WEBP (RIFF....WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true
  return false
}

// PERF: limit concurrent uploads to prevent OOM crashes
// 10 concurrent 10MB uploads = 100MB RAM; without limit, 50+ = 500MB = OOM kill on Railway
const MAX_CONCURRENT_UPLOADS = 10
let activeUploads = 0
const uploadQueue: Array<() => void> = []

function acquireUploadSlot(): Promise<void> {
  if (activeUploads < MAX_CONCURRENT_UPLOADS) {
    activeUploads++
    return Promise.resolve()
  }
  return new Promise((resolve) => uploadQueue.push(resolve))
}

function releaseUploadSlot(): void {
  activeUploads--
  const next = uploadQueue.shift()
  if (next) {
    activeUploads++
    next()
  }
}
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
  // PERF: backpressure — wait for an upload slot to prevent OOM from concurrent uploads
  await acquireUploadSlot()
  try {
    return await _uploadTaskMediaImpl(params)
  } finally {
    releaseUploadSlot()
  }
}

async function _uploadTaskMediaImpl(params: Parameters<typeof uploadTaskMedia>[0]) {
  const { userId, userRole, taskId, mediaType, file, mimeType, sizeBytes, idempotencyKey, deviceMeta } = params

  // Validate file type — check client-reported MIME
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new BadRequestError('Only JPEG, PNG, and WEBP images are allowed')
  }

  // SECURITY: validate actual file content via magic bytes (client can spoof MIME type)
  if (!isValidImageMagicBytes(file)) {
    throw new BadRequestError('File content does not match a valid image format (JPEG, PNG, or WEBP)')
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

  // Note: Dedup logic removed — reference point system allows multiple photos per type.
  // Legacy TaskMedia still accepts uploads but no longer deletes previous of same type.

  // SECURITY: server-side photo hash verification
  // Recompute SHA-256 of the uploaded file and compare with client-claimed hash.
  // Prevents attackers from uploading a different image than what was "captured".
  const serverHash = crypto.createHash('sha256').update(file).digest('hex')
  if (deviceMeta?.photoHash && !deviceMeta.photoHash.startsWith('fallback-')) {
    if (serverHash !== deviceMeta.photoHash) {
      logger.warn(
        { taskId, mediaType, clientHash: deviceMeta.photoHash, serverHash },
        'Photo hash mismatch — client-claimed hash does not match uploaded file',
      )
      // SECURITY: reject when enforcement is enabled (feature flag)
      // Deploy with flag off, update mobile to hash post-compression, then enable
      if (process.env.ENFORCE_PHOTO_HASH === 'true') {
        throw new BadRequestError('Photo integrity check failed — the uploaded file does not match the captured photo')
      }
    }
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
      idempotencyKey: idempotencyKey ?? null,
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
      serverPhotoHash:        serverHash,
      photoHashMatch:         deviceMeta?.photoHash ? (serverHash === deviceMeta.photoHash) : null,
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
