// eClean — AI Verification Engine Controller
//
// Handles HTTP request/response for AI verification endpoints.
// Business logic lives in the respective service files.

import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../../lib/prisma'
import { getAccuracyReport } from './calibration'

// ─── Review Queue ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/ai/review-queue
 * Returns tasks that need manual human review.
 * These are tasks where AI recommendation = REVIEW, or fraud flagged,
 * or AI was unavailable.
 */
export async function getReviewQueue(req: FastifyRequest, reply: FastifyReply) {
  const { page = '1', limit = '20', sort = 'fraud' } = req.query as Record<string, string>

  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20))

  // Find tasks in SUBMITTED status that need review
  // Either: AI recommendation = REVIEW, or AI failed (null score), or fraud flagged
  const where = {
    status: 'SUBMITTED' as const,
    OR: [
      // AI said REVIEW
      {
        aiScore: { not: null },
        aiScore: { gte: 0.45, lte: 0.70 },
      },
      // AI failed entirely
      { aiScore: null, submittedAt: { not: null } },
    ],
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        media: true,
        worker: { select: { id: true, name: true, email: true } },
        buyer: { select: { id: true, name: true } },
      },
    }),
    prisma.task.count({ where: { status: 'SUBMITTED' } }),
  ])

  // Enrich with verification data
  const enriched = await Promise.all(
    tasks.map(async (task) => {
      const verification = await prisma.aiVerification.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: 'desc' },
      })

      const trustProfile = task.workerId
        ? await prisma.workerTrustProfile.findUnique({ where: { workerId: task.workerId } })
        : null

      return {
        ...task,
        verification: verification ? {
          id: verification.id,
          finalScore: verification.finalScore,
          recommendation: verification.recommendation,
          confidence: verification.confidence,
          label: verification.label,
          fraudScore: verification.fraudScore,
          isFraudFlagged: verification.isFraudFlagged,
          reasoning: verification.reasoning,
          dimensions: {
            cleanlinessScore: verification.cleanlinessScore,
            workEvidenceScore: verification.workEvidenceScore,
            completenessScore: verification.completenessScore,
            safetyScore: verification.safetyScore,
            photoQualityScore: verification.photoQualityScore,
          },
          improvementSuggestions: verification.improvementSuggestions,
          attemptNumber: verification.attemptNumber,
        } : null,
        workerTrust: trustProfile ? {
          trustScore: trustProfile.trustScore,
          trustTier: trustProfile.trustTier,
          totalVerifications: trustProfile.totalVerifications,
          currentStreak: trustProfile.currentStreak,
          fraudFlagCount: trustProfile.fraudFlagCount,
        } : null,
      }
    }),
  )

  // Sort by fraud score (highest first) if requested
  if (sort === 'fraud') {
    enriched.sort((a, b) => {
      const aFraud = a.verification?.fraudScore ?? 0
      const bFraud = b.verification?.fraudScore ?? 0
      return bFraud - aFraud
    })
  }

  reply.send({ tasks: enriched, total, page: pageNum, limit: limitNum })
}

/**
 * GET /api/v1/ai/review-queue/stats
 * Quick statistics about the review queue.
 */
export async function getReviewQueueStats(req: FastifyRequest, reply: FastifyReply) {
  const [pending, fraudFlagged, aiUnavailable, totalToday] = await Promise.all([
    // Total submitted awaiting review
    prisma.task.count({ where: { status: 'SUBMITTED' } }),
    // Fraud flagged
    prisma.aiVerification.count({
      where: {
        isFraudFlagged: true,
        reviewStatus: 'PENDING',
      },
    }),
    // AI unavailable (submitted but no AI score)
    prisma.task.count({
      where: { status: 'SUBMITTED', aiScore: null, submittedAt: { not: null } },
    }),
    // Reviewed today
    prisma.aiVerification.count({
      where: {
        reviewedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        reviewStatus: { not: 'PENDING' },
      },
    }),
  ])

  reply.send({
    pendingReview: pending,
    fraudFlagged,
    aiUnavailable,
    reviewedToday: totalToday,
  })
}

// ─── Verification Details ───────────────────────────────────────────────────

/**
 * GET /api/v1/ai/verification/:taskId
 * Full verification result including all dimension scores, fraud signals,
 * worker trust context, and scoring breakdown.
 */
export async function getVerificationDetail(req: FastifyRequest, reply: FastifyReply) {
  const { taskId } = req.params as { taskId: string }
  const user = (req as any).user

  // Access check: buyer, worker, admin, supervisor
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { buyerId: true, workerId: true },
  })
  if (!task) return reply.status(404).send({ error: 'Task not found' })

  const canAccess = task.buyerId === user.id || task.workerId === user.id ||
    user.role === 'ADMIN' || user.role === 'SUPERVISOR'
  if (!canAccess) return reply.status(403).send({ error: 'Access denied' })

  const verification = await prisma.aiVerification.findFirst({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
  })

  if (!verification) {
    return reply.status(404).send({ error: 'No verification found for this task' })
  }

  reply.send({ verification })
}

/**
 * GET /api/v1/ai/verification/:taskId/history
 * All verification attempts for a task (for re-submissions).
 */
export async function getVerificationHistory(req: FastifyRequest, reply: FastifyReply) {
  const { taskId } = req.params as { taskId: string }
  const user = (req as any).user

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { buyerId: true, workerId: true },
  })
  if (!task) return reply.status(404).send({ error: 'Task not found' })

  const canAccess = task.buyerId === user.id || task.workerId === user.id ||
    user.role === 'ADMIN' || user.role === 'SUPERVISOR'
  if (!canAccess) return reply.status(403).send({ error: 'Access denied' })

  const verifications = await prisma.aiVerification.findMany({
    where: { taskId },
    orderBy: { attemptNumber: 'asc' },
  })

  reply.send({ verifications, totalAttempts: verifications.length })
}

// ─── Worker Trust ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/ai/trust/:workerId
 */
export async function getWorkerTrust(req: FastifyRequest, reply: FastifyReply) {
  const { workerId } = req.params as { workerId: string }

  const profile = await prisma.workerTrustProfile.findUnique({
    where: { workerId },
  })

  if (!profile) {
    return reply.status(404).send({ error: 'Worker trust profile not found' })
  }

  // Get recent verification history
  const recentVerifications = await prisma.aiVerification.findMany({
    where: {
      taskId: { in: (await prisma.task.findMany({
        where: { workerId },
        select: { id: true },
        take: 20,
        orderBy: { createdAt: 'desc' },
      })).map(t => t.id) },
    },
    select: {
      taskId: true,
      finalScore: true,
      label: true,
      recommendation: true,
      isFraudFlagged: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  reply.send({ profile, recentVerifications })
}

/**
 * GET /api/v1/ai/trust/leaderboard
 */
export async function getTrustLeaderboard(req: FastifyRequest, reply: FastifyReply) {
  const { limit = '20' } = req.query as Record<string, string>

  const profiles = await prisma.workerTrustProfile.findMany({
    where: { totalVerifications: { gte: 5 } }, // minimum 5 verifications to qualify
    orderBy: { trustScore: 'desc' },
    take: Math.min(50, parseInt(limit, 10) || 20),
  })

  // Enrich with worker names
  const workerIds = profiles.map(p => p.workerId)
  const workers = await prisma.user.findMany({
    where: { id: { in: workerIds } },
    select: { id: true, name: true, email: true },
  })
  const workerMap = new Map(workers.map(w => [w.id, w]))

  const leaderboard = profiles.map((p, i) => ({
    rank: i + 1,
    worker: workerMap.get(p.workerId) ?? { id: p.workerId, name: 'Unknown', email: '' },
    trustScore: p.trustScore,
    trustTier: p.trustTier,
    totalVerifications: p.totalVerifications,
    avgAiScore: p.avgAiScore,
    currentStreak: p.currentStreak,
    longestStreak: p.longestStreak,
    bestCategory: p.bestCategory,
    approvalRate: p.approvalRate,
  }))

  reply.send({ leaderboard })
}

// ─── Accuracy & Calibration ─────────────────────────────────────────────────

/**
 * GET /api/v1/ai/accuracy
 */
export async function getAccuracy(req: FastifyRequest, reply: FastifyReply) {
  const { days = '30' } = req.query as Record<string, string>
  const report = await getAccuracyReport(parseInt(days, 10) || 30)
  reply.send({ report })
}
