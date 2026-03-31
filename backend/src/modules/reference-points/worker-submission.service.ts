import { Readable } from 'stream'
import type { UploadApiResponse } from 'cloudinary'
import { prisma } from '../../lib/prisma'
import { cloudinary, assertCloudinaryConfigured } from '../../lib/cloudinary'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../lib/errors'
import { computeLocationMatchScore, haversineMeters } from './reference-points.service'
import { emitTaskPhotoAdded } from '../../realtime/socket'

// ─── Verification reveal threshold ───────────────────────────────────────────

const VERIFICATION_REVEAL_METERS = 50

// ─── Submit Point Photo (Worker) ─────────────────────────────────────────────

export async function submitPointPhoto(params: {
  taskId: string
  referencePointId: string
  workerId: string
  mediaType: 'AFTER' | 'VERIFICATION'
  file: Buffer
  mimeType: string
  sizeBytes: number
  idempotencyKey?: string | undefined
  deviceMeta?: {
    capturedLat?: number | undefined
    capturedLng?: number | undefined
    capturedAt?: string | undefined
    deviceId?: string | undefined
    photoHash?: string | undefined
  } | undefined
}) {
  const { taskId, referencePointId, workerId, mediaType, file, idempotencyKey, deviceMeta } = params

  // Idempotency check
  if (idempotencyKey) {
    const existing = await prisma.workerPointSubmission.findUnique({ where: { idempotencyKey } })
    if (existing) return existing
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.workerId !== workerId) throw new ForbiddenError('Not your task')
  if (task.status !== 'IN_PROGRESS') throw new BadRequestError('Task is not in progress')

  const refPoint = await prisma.taskReferencePoint.findUnique({ where: { id: referencePointId } })
  if (!refPoint || refPoint.taskId !== taskId) throw new NotFoundError('Reference point not found')

  // If submitting as VERIFICATION, the point must actually be a verification point
  if (mediaType === 'VERIFICATION' && !refPoint.isVerificationPoint) {
    throw new BadRequestError('This point is not a verification point')
  }

  assertCloudinaryConfigured()

  // Upload to Cloudinary
  const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:         `eclean/tasks/${taskId}/worker`,
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

  // Compute location match score
  const locationScore = computeLocationMatchScore(
    deviceMeta?.capturedLat, deviceMeta?.capturedLng,
    refPoint.buyerLat, refPoint.buyerLng,
  )

  // Create submission
  const submission = await prisma.workerPointSubmission.create({
    data: {
      taskId,
      referencePointId,
      workerId,
      mediaType,
      imageUrl:           uploadResult.secure_url,
      imagePublicId:      uploadResult.public_id,
      workerLat:          deviceMeta?.capturedLat ?? null,
      workerLng:          deviceMeta?.capturedLng ?? null,
      photoHash:          deviceMeta?.photoHash ?? null,
      capturedAt:         deviceMeta?.capturedAt ? new Date(deviceMeta.capturedAt) : null,
      deviceId:           deviceMeta?.deviceId ?? null,
      idempotencyKey:     idempotencyKey ?? null,
      locationMatchScore: locationScore,
    },
  })

  // Fire socket event
  emitTaskPhotoAdded(taskId, submission)

  return submission
}

// ─── Get Submission Progress ─────────────────────────────────────────────────

export async function getSubmissionProgress(
  taskId: string,
  userId: string,
  userRole: string,
  workerLat?: number,
  workerLng?: number,
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Access control
  const isBuyer    = task.buyerId === userId
  const isWorker   = task.workerId === userId
  const isPrivileged = userRole === 'SUPERVISOR' || userRole === 'ADMIN'
  if (!isBuyer && !isWorker && !isPrivileged) {
    throw new ForbiddenError('You do not have access to this task')
  }

  const referencePoints = await prisma.taskReferencePoint.findMany({
    where:   { taskId },
    orderBy: { pointIndex: 'asc' },
  })

  const submissions = await prisma.workerPointSubmission.findMany({
    where: { taskId },
  })

  const submissionByPoint = new Map<string, typeof submissions[number]>()
  for (const s of submissions) {
    // Keep the latest submission per point
    if (!submissionByPoint.has(s.referencePointId)) {
      submissionByPoint.set(s.referencePointId, s)
    }
  }

  const verificationPoints = referencePoints.filter((p) => p.isVerificationPoint)
  const verificationCompleted = verificationPoints.filter((p) =>
    submissions.some((s) => s.referencePointId === p.id && s.mediaType === 'VERIFICATION'),
  ).length

  const afterCompleted = referencePoints.filter((p) =>
    submissions.some((s) => s.referencePointId === p.id && s.mediaType === 'AFTER'),
  ).length

  // Submit requirements
  const minAfter = Math.max(3, Math.ceil(referencePoints.length * 0.7))
  // Allow submit when: all after photos done AND (verification done OR no verification points exist)
  // Verification points are optional anti-fraud — don't block submit if worker completed all after photos
  const canSubmit =
    referencePoints.length > 0 &&
    afterCompleted >= minAfter &&
    (verificationPoints.length === 0 || verificationCompleted >= verificationPoints.length || afterCompleted >= referencePoints.length)

  const points = referencePoints.map((p) => {
    // Distance from worker
    let distanceFromWorker: number | null = null
    if (workerLat != null && workerLng != null && p.buyerLat != null && p.buyerLng != null) {
      distanceFromWorker = Math.round(haversineMeters(workerLat, workerLng, p.buyerLat, p.buyerLng))
    }

    // Reveal verification status only when worker is close enough
    let revealedVerification = p.isVerificationPoint
    if (isWorker && p.isVerificationPoint) {
      revealedVerification = distanceFromWorker !== null && distanceFromWorker <= VERIFICATION_REVEAL_METERS
    }

    const afterSub = submissions.find((s) => s.referencePointId === p.id && s.mediaType === 'AFTER')
    const verifySub = submissions.find((s) => s.referencePointId === p.id && s.mediaType === 'VERIFICATION')

    return {
      id:                       p.id,
      pointIndex:               p.pointIndex,
      label:                    p.label,
      buyerImageUrl:            p.buyerImageUrl,
      buyerLat:                 p.buyerLat,
      buyerLng:                 p.buyerLng,
      isVerificationPoint:      revealedVerification,
      distanceFromWorker,
      hasAfterSubmission:       !!afterSub,
      hasVerificationSubmission: !!verifySub,
      afterSubmission:          afterSub ?? null,
    }
  })

  // Avg location score
  const scores = submissions.map((s) => s.locationMatchScore).filter((s): s is number => s !== null)
  const avgLocationScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const elapsed = task.startedAt ? Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 60_000) : 0

  return {
    totalPoints:           referencePoints.length,
    verificationRequired:  verificationPoints.length,
    verificationCompleted,
    afterCompleted,
    canSubmit,
    points,
    summary: {
      avgLocationScore,
      totalPhotos: submissions.length,
      elapsedMinutes: elapsed,
    },
  }
}
