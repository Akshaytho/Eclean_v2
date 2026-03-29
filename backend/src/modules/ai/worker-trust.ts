// eClean — Worker Trust Score System
//
// The "credit score" for workers. Built over time from:
// - AI verification scores
// - Fraud flag history
// - Buyer approval/rejection patterns
// - Category-specific performance
// - Consistency and reliability
//
// Trust tiers affect verification strictness:
// - NEW: Standard checks, all signals weighted equally
// - BUILDING: Standard checks, slight benefit of the doubt
// - TRUSTED: Relaxed checks, minor issues forgiven
// - EXPERT: Minimal checks, only major flags reviewed
// - FLAGGED: Strict checks, every signal amplified
//
// Trust changes slowly — takes weeks to build, minutes to lose.
// This asymmetry is intentional: trust is earned, not given.

import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

// ─── Trust Tier Thresholds ──────────────────────────────────────────────────

export const TRUST_TIERS = {
  FLAGGED:  { min: 0.00, max: 0.20 },
  NEW:      { min: 0.20, max: 0.45 },
  BUILDING: { min: 0.45, max: 0.65 },
  TRUSTED:  { min: 0.65, max: 0.85 },
  EXPERT:   { min: 0.85, max: 1.00 },
} as const

export type TrustTier = keyof typeof TRUST_TIERS

// ─── Score Adjustment Weights ───────────────────────────────────────────────
// These control how much each signal moves the trust score.
// Positive = builds trust, Negative = damages trust.

const SCORE_ADJUSTMENTS = {
  // Positive signals
  VERIFICATION_PASSED:      +0.02,  // AI approved
  BUYER_APPROVED:           +0.03,  // Buyer agreed with AI approval
  STREAK_BONUS_5:           +0.02,  // 5 consecutive approvals
  STREAK_BONUS_10:          +0.03,  // 10 consecutive approvals
  STREAK_BONUS_25:          +0.05,  // 25 consecutive approvals
  HIGH_SCORE:               +0.01,  // AI score > 0.85

  // Negative signals
  VERIFICATION_FAILED:      -0.03,  // AI rejected
  BUYER_REJECTED:           -0.05,  // Buyer rejected
  FRAUD_FLAG_LOW:           -0.03,  // Low severity fraud signal
  FRAUD_FLAG_MEDIUM:        -0.05,  // Medium severity
  FRAUD_FLAG_HIGH:          -0.10,  // High severity
  FRAUD_FLAG_CRITICAL:      -0.20,  // Critical fraud — near-instant FLAGGED
  DISPUTE_LOST:             -0.08,  // Worker lost a dispute
  STREAK_BROKEN:            -0.01,  // Streak reset

  // Neutral/informational
  DISPUTE_WON:              +0.05,  // Worker won a dispute — AI was wrong
}

// ─── Get or Create Trust Profile ────────────────────────────────────────────

export async function getWorkerTrustProfile(workerId: string) {
  let profile = await prisma.workerTrustProfile.findUnique({
    where: { workerId },
  })

  if (!profile) {
    profile = await prisma.workerTrustProfile.create({
      data: {
        workerId,
        trustScore: 0.35, // Start in NEW tier
        trustTier: 'NEW',
      },
    })
  }

  return profile
}

// ─── Determine Trust Tier ───────────────────────────────────────────────────

export function determineTier(score: number): TrustTier {
  if (score < TRUST_TIERS.FLAGGED.max) return 'FLAGGED'
  if (score < TRUST_TIERS.NEW.max) return 'NEW'
  if (score < TRUST_TIERS.BUILDING.max) return 'BUILDING'
  if (score < TRUST_TIERS.TRUSTED.max) return 'TRUSTED'
  return 'EXPERT'
}

// ─── Update Trust After Verification ────────────────────────────────────────

export interface TrustUpdateInput {
  workerId: string
  aiScore: number
  recommendation: string   // APPROVE, REVIEW, REJECT
  fraudScore: number
  fraudFlagged: boolean
  category: string
}

/**
 * Update worker's trust score after AI verification.
 * Called by the verification engine after processing.
 */
export async function updateTrustAfterVerification(input: TrustUpdateInput): Promise<void> {
  try {
    const profile = await getWorkerTrustProfile(input.workerId)
    let adjustment = 0

    // AI verification result
    if (input.recommendation === 'APPROVE') {
      adjustment += SCORE_ADJUSTMENTS.VERIFICATION_PASSED
      if (input.aiScore > 0.85) {
        adjustment += SCORE_ADJUSTMENTS.HIGH_SCORE
      }
    } else if (input.recommendation === 'REJECT') {
      adjustment += SCORE_ADJUSTMENTS.VERIFICATION_FAILED
    }

    // Fraud signals
    if (input.fraudFlagged) {
      if (input.fraudScore >= 0.8) {
        adjustment += SCORE_ADJUSTMENTS.FRAUD_FLAG_CRITICAL
      } else if (input.fraudScore >= 0.6) {
        adjustment += SCORE_ADJUSTMENTS.FRAUD_FLAG_HIGH
      } else if (input.fraudScore >= 0.4) {
        adjustment += SCORE_ADJUSTMENTS.FRAUD_FLAG_MEDIUM
      } else {
        adjustment += SCORE_ADJUSTMENTS.FRAUD_FLAG_LOW
      }
    }

    // Streak tracking
    let newStreak = profile.currentStreak
    let longestStreak = profile.longestStreak
    if (input.recommendation === 'APPROVE' && !input.fraudFlagged) {
      newStreak += 1
      if (newStreak > longestStreak) longestStreak = newStreak

      // Streak bonuses
      if (newStreak === 5)  adjustment += SCORE_ADJUSTMENTS.STREAK_BONUS_5
      if (newStreak === 10) adjustment += SCORE_ADJUSTMENTS.STREAK_BONUS_10
      if (newStreak === 25) adjustment += SCORE_ADJUSTMENTS.STREAK_BONUS_25
    } else if (input.recommendation === 'REJECT' || input.fraudFlagged) {
      if (newStreak > 0) {
        adjustment += SCORE_ADJUSTMENTS.STREAK_BROKEN
      }
      newStreak = 0
    }

    // Apply adjustment with bounds
    const newScore = Math.min(1.0, Math.max(0.0, profile.trustScore + adjustment))
    const newTier = determineTier(newScore)

    // Update category scores
    const categoryScores = (profile.categoryScores as Record<string, number>) ?? {}
    const prevCatScore = categoryScores[input.category] ?? 0.5
    // Exponential moving average — recent scores matter more
    categoryScores[input.category] = prevCatScore * 0.7 + input.aiScore * 0.3

    const bestCategory = Object.entries(categoryScores)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
    const worstCategory = Object.entries(categoryScores)
      .sort(([, a], [, b]) => a - b)[0]?.[0] ?? null

    // Compute rolling averages
    const recentVerifications = await prisma.aiVerification.findMany({
      where: {
        taskId: { in: (await prisma.task.findMany({
          where: { workerId: input.workerId },
          select: { id: true },
          take: 50,
          orderBy: { createdAt: 'desc' },
        })).map(t => t.id) },
      },
      select: { finalScore: true, photoQualityScore: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    const avgAiScore = recentVerifications.length > 0
      ? recentVerifications.reduce((s, v) => s + v.finalScore, 0) / recentVerifications.length
      : null

    const photoQualityAvg = recentVerifications.length > 0
      ? recentVerifications.reduce((s, v) => s + v.photoQualityScore, 0) / recentVerifications.length
      : null

    // Consistency: low std deviation = consistent worker
    let consistencyScore: number | null = null
    if (recentVerifications.length >= 5) {
      const scores = recentVerifications.map(v => v.finalScore)
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
      const stdDev = Math.sqrt(variance)
      // Low std dev = high consistency. Map 0-0.3 std dev to 1.0-0.0 consistency.
      consistencyScore = Math.max(0, 1 - (stdDev / 0.3))
    }

    await prisma.workerTrustProfile.update({
      where: { workerId: input.workerId },
      data: {
        trustScore: Math.round(newScore * 1000) / 1000,
        trustTier: newTier,
        totalVerifications: { increment: 1 },
        avgAiScore: avgAiScore !== null ? Math.round(avgAiScore * 100) / 100 : undefined,
        fraudFlagCount: input.fraudFlagged ? { increment: 1 } : undefined,
        recentFraudFlags: input.fraudFlagged ? { increment: 1 } : undefined,
        currentStreak: newStreak,
        longestStreak,
        lastVerifiedAt: new Date(),
        categoryScores,
        bestCategory,
        worstCategory,
        consistencyScore: consistencyScore !== null ? Math.round(consistencyScore * 100) / 100 : undefined,
        photoQualityAvg: photoQualityAvg !== null ? Math.round(photoQualityAvg * 100) / 100 : undefined,
      },
    })

    logger.info(
      { workerId, oldScore: profile.trustScore, newScore, tier: newTier, adjustment, streak: newStreak },
      'Worker trust score updated',
    )
  } catch (err) {
    // Trust updates are important but not critical — log and continue
    logger.error({ err, workerId: input.workerId }, 'Failed to update worker trust score')
  }
}

// ─── Update Trust After Human Decision ──────────────────────────────────────

export interface HumanDecisionInput {
  workerId: string
  decision: 'APPROVED' | 'REJECTED' | 'DISPUTED'
  aiRecommendation: string
  decidedByRole: string
}

/**
 * Update trust when a buyer/admin makes a final decision on a task.
 * This is the feedback loop — if AI was wrong, trust adjusts accordingly.
 */
export async function updateTrustAfterHumanDecision(input: HumanDecisionInput): Promise<void> {
  try {
    const profile = await getWorkerTrustProfile(input.workerId)
    let adjustment = 0

    if (input.decision === 'APPROVED') {
      adjustment += SCORE_ADJUSTMENTS.BUYER_APPROVED
    } else if (input.decision === 'REJECTED') {
      adjustment += SCORE_ADJUSTMENTS.BUYER_REJECTED
    }

    const newScore = Math.min(1.0, Math.max(0.0, profile.trustScore + adjustment))
    const newTier = determineTier(newScore)

    // Update approval/dispute rates
    const last30days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const recentTasks = await prisma.task.findMany({
      where: {
        workerId: input.workerId,
        submittedAt: { gte: last30days },
        status: { in: ['APPROVED', 'REJECTED', 'DISPUTED', 'COMPLETED'] },
      },
      select: { status: true },
    })

    const total = recentTasks.length
    const approved = recentTasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED').length
    const disputed = recentTasks.filter(t => t.status === 'DISPUTED').length

    await prisma.workerTrustProfile.update({
      where: { workerId: input.workerId },
      data: {
        trustScore: Math.round(newScore * 1000) / 1000,
        trustTier: newTier,
        approvalRate: total > 0 ? Math.round((approved / total) * 100) / 100 : null,
        disputeRate: total > 0 ? Math.round((disputed / total) * 100) / 100 : null,
      },
    })
  } catch (err) {
    logger.error({ err, workerId: input.workerId }, 'Failed to update trust after human decision')
  }
}

// ─── Get Worker Context for Verification ────────────────────────────────────

/**
 * Returns a snapshot of the worker's trust context for the verification engine.
 * This is stored in AiVerification.workerHistoryContext for audit trail.
 */
export async function getWorkerContext(workerId: string) {
  const profile = await getWorkerTrustProfile(workerId)

  return {
    trustScore: profile.trustScore,
    trustTier: profile.trustTier,
    totalVerifications: profile.totalVerifications,
    avgAiScore: profile.avgAiScore,
    approvalRate: profile.approvalRate,
    disputeRate: profile.disputeRate,
    fraudFlagCount: profile.fraudFlagCount,
    recentFraudFlags: profile.recentFraudFlags,
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    bestCategory: profile.bestCategory,
    worstCategory: profile.worstCategory,
    categoryScores: profile.categoryScores,
    consistencyScore: profile.consistencyScore,
  }
}
