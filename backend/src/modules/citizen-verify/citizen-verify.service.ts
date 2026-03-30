/**
 * Citizen Mesh Verification Service
 *
 * Post-task crowd-sourced verification:
 * 1. After task approval, system waits 1-48 hours (random)
 * 2. Selects 1-3 citizens near the task location
 * 3. Citizen takes a photo / rates the area
 * 4. Result updates worker trust score
 *
 * Zero worker effort — happens after worker is done and paid.
 */

import { prisma } from '../../lib/prisma'
import { NotFoundError, BadRequestError, ForbiddenError } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { haversineMeters } from '../reference-points/reference-points.service'

// ─── Config ──────────────────────────────────────────────────────────────────

// Config constants (VERIFICATION_RADIUS_METERS and MAX_PENDING_VERIFICATIONS
// will be used when citizen selection scheduler is added)
const REWARD_CLEAN_PAISE = 500       // ₹5
const REWARD_DIRTY_PAISE = 1000      // ₹10
const REWARD_RATING_ONLY_PAISE = 200 // ₹2

// ─── Get tasks near citizen that need verification ───────────────────────────

export async function getVerifyTasksNearCitizen(
  citizenId: string,
  lat: number,
  lng: number,
  radiusKm = 0.5,
) {
  // Find APPROVED/COMPLETED tasks from last 48 hours without citizen verification
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: ['APPROVED', 'COMPLETED'] },
      completedAt: { gte: cutoff },
      locationLat: { not: null },
      locationLng: { not: null },
      // Not already verified by this citizen
      citizenVerifications: {
        none: { citizenId },
      },
      // Not the buyer or worker
      buyerId: { not: citizenId },
      workerId: { not: citizenId },
    },
    include: {
      workerSubmissions: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    take: 10,
  })

  // Filter by distance
  return tasks
    .filter((t) => {
      if (!t.locationLat || !t.locationLng) return false
      const dist = haversineMeters(lat, lng, t.locationLat, t.locationLng)
      return dist <= radiusKm * 1000
    })
    .map((t) => ({
      id: t.id,
      title: t.title,
      completedAt: t.completedAt?.toISOString() ?? null,
      location: { lat: t.locationLat!, lng: t.locationLng! },
      distanceMeters: Math.round(haversineMeters(lat, lng, t.locationLat!, t.locationLng!)),
      workerAfterImageUrl: t.workerSubmissions[0]?.imageUrl ?? null,
      rewardAmount: REWARD_CLEAN_PAISE,
    }))
}

// ─── Citizen submits verification ────────────────────────────────────────────

export async function submitCitizenVerification(params: {
  taskId: string
  citizenId: string
  rating: 'CLEAN' | 'PARTIALLY_CLEAN' | 'DIRTY'
  photoUrl?: string | null | undefined
  photoPublicId?: string | null | undefined
  citizenLat?: number | null | undefined
  citizenLng?: number | null | undefined
}) {
  const task = await prisma.task.findUnique({ where: { id: params.taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.buyerId === params.citizenId || task.workerId === params.citizenId) {
    throw new ForbiddenError('Cannot verify your own task')
  }

  // Check not already verified by this citizen
  const existing = await prisma.citizenVerification.findFirst({
    where: { taskId: params.taskId, citizenId: params.citizenId },
  })
  if (existing) throw new BadRequestError('You already verified this task')

  // Determine reward
  const hasPhoto = !!params.photoUrl
  let rewardAmount: number
  if (!hasPhoto) {
    rewardAmount = REWARD_RATING_ONLY_PAISE
  } else if (params.rating === 'DIRTY') {
    rewardAmount = REWARD_DIRTY_PAISE
  } else {
    rewardAmount = REWARD_CLEAN_PAISE
  }

  const verification = await prisma.citizenVerification.create({
    data: {
      taskId: params.taskId,
      citizenId: params.citizenId,
      rating: params.rating,
      photoUrl: params.photoUrl ?? null,
      photoPublicId: params.photoPublicId ?? null,
      citizenLat: params.citizenLat ?? null,
      citizenLng: params.citizenLng ?? null,
      matchesWorker: null, // AI comparison deferred
      rewardAmount,
      rewardPaid: false,
      verifiedAt: new Date(),
    },
  })

  // Update worker trust score (fire-and-forget)
  if (task.workerId) {
    const trustDelta = params.rating === 'CLEAN' ? 1
      : params.rating === 'DIRTY' ? -3
      : 0

    if (trustDelta !== 0) {
      prisma.workerProfile.update({
        where: { userId: task.workerId },
        data: { trustScore: { increment: trustDelta } },
      }).catch((err) => {
        logger.error({ workerId: task.workerId, err }, 'Failed to update worker trust score from citizen verification')
      })
    }
  }

  return {
    verification: {
      id: verification.id,
      rating: verification.rating,
      rewardAmount: verification.rewardAmount,
      message: `Thank you! ₹${verification.rewardAmount / 100} will be credited to your wallet.`,
    },
  }
}
