import { Readable } from 'stream'
import type { UploadApiResponse } from 'cloudinary'
import { prisma } from '../../lib/prisma'
import { cloudinary, assertCloudinaryConfigured } from '../../lib/cloudinary'
import { BadRequestError, NotFoundError, ForbiddenError } from '../../lib/errors'
import { MAX_REFERENCE_POINTS } from './reference-points.schema'

// ─── Add Reference Point (Buyer) ─────────────────────────────────────────────

export async function addReferencePoint(params: {
  taskId: string
  buyerId: string
  pointIndex: number
  label?: string | undefined
  file: Buffer
  mimeType: string
  sizeBytes: number
  idempotencyKey?: string | undefined
  deviceMeta?: {
    capturedLat?: number | undefined
    capturedLng?: number | undefined
    capturedAt?: string | undefined
    photoHash?: string | undefined
  } | undefined
}) {
  const { taskId, buyerId, pointIndex, file, idempotencyKey, deviceMeta } = params

  // Idempotency check
  if (idempotencyKey) {
    const existing = await prisma.workerPointSubmission.findUnique({ where: { idempotencyKey } })
    if (existing) return existing
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  if (task.status !== 'OPEN') throw new BadRequestError('Can only add reference points to OPEN tasks')

  const existingCount = await prisma.taskReferencePoint.count({ where: { taskId } })
  if (existingCount >= MAX_REFERENCE_POINTS) {
    throw new BadRequestError(`Maximum ${MAX_REFERENCE_POINTS} reference points allowed`)
  }

  // Check for duplicate pointIndex
  const duplicate = await prisma.taskReferencePoint.findUnique({
    where: { taskId_pointIndex: { taskId, pointIndex } },
  })
  if (duplicate) throw new BadRequestError(`Reference point ${pointIndex} already exists`)

  assertCloudinaryConfigured()

  // Upload to Cloudinary
  const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:         `eclean/tasks/${taskId}/ref`,
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

  // Create reference point
  const point = await prisma.taskReferencePoint.create({
    data: {
      taskId,
      pointIndex,
      label:              params.label ?? null,
      buyerImageUrl:      uploadResult.secure_url,
      buyerImagePublicId: uploadResult.public_id,
      buyerLat:           deviceMeta?.capturedLat ?? null,
      buyerLng:           deviceMeta?.capturedLng ?? null,
    },
  })

  // Update task reference point count
  await prisma.task.update({
    where: { id: taskId },
    data:  { totalReferencePoints: existingCount + 1 },
  })

  return point
}

// ─── List Reference Points ───────────────────────────────────────────────────

export async function listReferencePoints(taskId: string, userId: string, userRole: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Access control:
  // - Any worker can view reference points for OPEN tasks (to decide whether to accept)
  // - After acceptance: only buyer, assigned worker, supervisor, admin
  const isBuyer      = task.buyerId === userId
  const isWorker     = task.workerId === userId
  const isPrivileged = userRole === 'SUPERVISOR' || userRole === 'ADMIN'
  const isWorkerBrowsingOpen = userRole === 'WORKER' && task.status === 'OPEN'
  if (!isBuyer && !isWorker && !isPrivileged && !isWorkerBrowsingOpen) {
    throw new ForbiddenError('You do not have access to this task')
  }

  const points = await prisma.taskReferencePoint.findMany({
    where:   { taskId },
    orderBy: { pointIndex: 'asc' },
    include: { workerSubmissions: true },
  })

  // For workers: hide isVerificationPoint (revealed via proximity in progress endpoint)
  if (isWorker) {
    return {
      referencePoints: points.map((p) => ({ ...p, isVerificationPoint: false })),
      totalPoints: points.length,
      verificationRequired: points.filter((p) => p.isVerificationPoint).length,
    }
  }

  return {
    referencePoints: points,
    totalPoints: points.length,
    verificationRequired: points.filter((p) => p.isVerificationPoint).length,
  }
}

// ─── Delete Reference Point (Buyer, before acceptance only) ──────────────────

export async function deleteReferencePoint(taskId: string, pointId: string, buyerId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.buyerId !== buyerId) throw new ForbiddenError('Not your task')
  if (task.status !== 'OPEN') {
    throw new BadRequestError('Cannot delete reference points after task is accepted')
  }

  const point = await prisma.taskReferencePoint.findUnique({ where: { id: pointId } })
  if (!point || point.taskId !== taskId) throw new NotFoundError('Reference point not found')

  // Delete from Cloudinary (fire-and-forget)
  if (point.buyerImagePublicId) {
    try {
      await cloudinary.uploader.destroy(point.buyerImagePublicId)
    } catch {
      // Cloudinary cleanup failure is non-critical
    }
  }

  await prisma.taskReferencePoint.delete({ where: { id: pointId } })

  // Update count
  const remaining = await prisma.taskReferencePoint.count({ where: { taskId } })
  await prisma.task.update({
    where: { id: taskId },
    data:  { totalReferencePoints: remaining },
  })

  return { message: 'Reference point deleted' }
}

// ─── Select Verification Points (called on task acceptance) ──────────────────

export async function selectVerificationPoints(taskId: string) {
  const points = await prisma.taskReferencePoint.findMany({ where: { taskId } })

  if (points.length < 2) return // not enough points to verify

  // Cluster by proximity (20m threshold) and pick from distant clusters
  const selected = pickVerificationPoints(points)

  if (selected.length > 0) {
    await prisma.taskReferencePoint.updateMany({
      where: { id: { in: selected.map((p) => p.id) } },
      data:  { isVerificationPoint: true },
    })
  }
}

function pickVerificationPoints(
  points: Array<{ id: string; buyerLat: number | null; buyerLng: number | null; pointIndex: number }>,
): Array<{ id: string }> {
  // If fewer than 3 points, just pick randomly
  if (points.length <= 2) return points.map((p) => ({ id: p.id }))

  const geoPoints = points.filter((p) => p.buyerLat !== null && p.buyerLng !== null)

  if (geoPoints.length >= 2) {
    // Find the two most distant points
    let maxDist = 0
    let pair: [string, string] = [geoPoints[0].id, geoPoints[1].id]

    for (let i = 0; i < geoPoints.length; i++) {
      for (let j = i + 1; j < geoPoints.length; j++) {
        const dist = haversineMeters(
          geoPoints[i].buyerLat!, geoPoints[i].buyerLng!,
          geoPoints[j].buyerLat!, geoPoints[j].buyerLng!,
        )
        if (dist > maxDist) {
          maxDist = dist
          pair = [geoPoints[i].id, geoPoints[j].id]
        }
      }
    }

    // If distance > 20m, use the most distant pair (covers widest area)
    if (maxDist > 20) return [{ id: pair[0] }, { id: pair[1] }]
  }

  // Fallback: random pick 2, preferring non-first/non-last points
  const middle = points.filter((p) => p.pointIndex !== 1 && p.pointIndex !== points.length)
  if (middle.length >= 2) {
    const shuffled = middle.sort(() => Math.random() - 0.5)
    return [{ id: shuffled[0].id }, { id: shuffled[1].id }]
  }

  // Final fallback: random 2 from all
  const shuffled = [...points].sort(() => Math.random() - 0.5)
  return [{ id: shuffled[0].id }, { id: shuffled[1].id }]
}

// ─── Haversine (meters) ──────────────────────────────────────────────────────

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function computeLocationMatchScore(
  workerLat: number | null | undefined,
  workerLng: number | null | undefined,
  buyerLat: number | null,
  buyerLng: number | null,
): number | null {
  if (!workerLat || !workerLng || !buyerLat || !buyerLng) return null

  const distanceMeters = haversineMeters(workerLat, workerLng, buyerLat, buyerLng)

  if (distanceMeters <= 10) return 100
  if (distanceMeters <= 50) return 90
  if (distanceMeters <= 100) return 75
  if (distanceMeters <= 200) return 50
  if (distanceMeters <= 500) return 25
  return 0
}
