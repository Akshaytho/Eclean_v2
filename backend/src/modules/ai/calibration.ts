// eClean — Confidence Calibration & Feedback Loop
//
// This is the system that makes the verification engine SMARTER over time
// without retraining any model. It works by:
//
// 1. RECORDING: Every AI decision + human outcome pair
// 2. ANALYZING: Where is the AI too lenient? Too strict? For which categories?
// 3. ADJUSTING: Dynamic threshold adjustments based on accuracy trends
//
// This data is also the TRAINING DATASET for Phase 2-3:
// When you have 50K+ calibration events, you can train a custom model
// that knows exactly what "clean" looks like for each category in India.
//
// The calibration table (AiCalibrationEvent) is literally worth millions
// in labeled training data. Every human approval/rejection is a label.

import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

// ─── Record Calibration Event ───────────────────────────────────────────────

export interface CalibrationInput {
  verificationId: string
  taskId: string
  aiScore: number
  aiRecommendation: string
  aiConfidence: number
  humanDecision: string   // APPROVED, REJECTED, DISPUTED
  decidedBy: string       // userId
  decidedByRole: string   // BUYER, ADMIN, SUPERVISOR
  category: string
  dirtyLevel: string
  workerTrustAtTime: number | null
}

/**
 * Record a calibration event when a human makes a decision on a verified task.
 * This is the feedback signal that drives system improvement.
 */
export async function recordCalibrationEvent(input: CalibrationInput): Promise<void> {
  try {
    // Does AI agree with human?
    const aiSaidApprove = input.aiRecommendation === 'APPROVE'
    const humanApproved = input.humanDecision === 'APPROVED'
    const decisionMatchedAi = aiSaidApprove === humanApproved

    // Score gap: how far was AI from the "right" answer?
    // If human approved and AI scored 0.5, gap is 0.5 (AI too low)
    // If human rejected and AI scored 0.9, gap is 0.9 (AI too high)
    const impliedHumanScore = humanApproved ? 1.0 : 0.0
    const scoreGap = Math.abs(input.aiScore - impliedHumanScore)

    await prisma.aiCalibrationEvent.create({
      data: {
        verificationId: input.verificationId,
        taskId: input.taskId,
        aiScore: input.aiScore,
        aiRecommendation: input.aiRecommendation,
        aiConfidence: input.aiConfidence,
        humanDecision: input.humanDecision,
        decidedBy: input.decidedBy,
        decidedByRole: input.decidedByRole,
        decisionMatchedAi: decisionMatchedAi,
        category: input.category,
        dirtyLevel: input.dirtyLevel,
        workerTrustAtTime: input.workerTrustAtTime,
        scoreGap,
      },
    })

    // Also update the AiVerification record
    await prisma.aiVerification.updateMany({
      where: { id: input.verificationId },
      data: {
        reviewStatus: input.humanDecision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        reviewedBy: input.decidedBy,
        reviewedAt: new Date(),
        reviewDecision: decisionMatchedAi ? 'AGREE' : (humanApproved ? 'OVERRIDE_APPROVE' : 'OVERRIDE_REJECT'),
        buyerAgreed: decisionMatchedAi,
      },
    })

    logger.info(
      {
        taskId: input.taskId,
        aiRecommendation: input.aiRecommendation,
        humanDecision: input.humanDecision,
        matched: decisionMatchedAi,
        scoreGap,
      },
      'Calibration event recorded',
    )
  } catch (err) {
    logger.error({ err, taskId: input.taskId }, 'Failed to record calibration event (non-fatal)')
  }
}

// ─── Accuracy Analytics ─────────────────────────────────────────────────────

export interface AccuracyReport {
  totalEvents: number
  accuracyRate: number          // % of times AI matched human decision
  falseApprovalRate: number     // AI said APPROVE, human said REJECT
  falseRejectionRate: number    // AI said REJECT, human said APPROVE
  avgScoreGap: number           // average distance between AI and human
  byCategory: Record<string, { accuracy: number; count: number }>
  byDirtyLevel: Record<string, { accuracy: number; count: number }>
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING'
}

/**
 * Compute accuracy analytics for the last N days.
 * Used by the admin dashboard and for automatic threshold adjustment.
 */
export async function getAccuracyReport(days: number = 30): Promise<AccuracyReport> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prisma.aiCalibrationEvent.findMany({
    where: { createdAt: { gte: since } },
    select: {
      decisionMatchedAi: true,
      aiRecommendation: true,
      humanDecision: true,
      scoreGap: true,
      category: true,
      dirtyLevel: true,
      createdAt: true,
    },
  })

  if (events.length === 0) {
    return {
      totalEvents: 0,
      accuracyRate: 0,
      falseApprovalRate: 0,
      falseRejectionRate: 0,
      avgScoreGap: 0,
      byCategory: {},
      byDirtyLevel: {},
      trend: 'STABLE',
    }
  }

  const matched = events.filter(e => e.decisionMatchedAi).length
  const falseApprovals = events.filter(
    e => e.aiRecommendation === 'APPROVE' && e.humanDecision === 'REJECTED',
  ).length
  const falseRejections = events.filter(
    e => e.aiRecommendation === 'REJECT' && e.humanDecision === 'APPROVED',
  ).length

  const avgGap = events.reduce((sum, e) => sum + (e.scoreGap ?? 0), 0) / events.length

  // By category
  const byCategory: Record<string, { accuracy: number; count: number }> = {}
  const catGroups = new Map<string, typeof events>()
  for (const e of events) {
    const group = catGroups.get(e.category) ?? []
    group.push(e)
    catGroups.set(e.category, group)
  }
  for (const [cat, group] of catGroups) {
    const catMatched = group.filter(e => e.decisionMatchedAi).length
    byCategory[cat] = {
      accuracy: Math.round((catMatched / group.length) * 100) / 100,
      count: group.length,
    }
  }

  // By dirty level
  const byDirtyLevel: Record<string, { accuracy: number; count: number }> = {}
  const dlGroups = new Map<string, typeof events>()
  for (const e of events) {
    const group = dlGroups.get(e.dirtyLevel) ?? []
    group.push(e)
    dlGroups.set(e.dirtyLevel, group)
  }
  for (const [dl, group] of dlGroups) {
    const dlMatched = group.filter(e => e.decisionMatchedAi).length
    byDirtyLevel[dl] = {
      accuracy: Math.round((dlMatched / group.length) * 100) / 100,
      count: group.length,
    }
  }

  // Trend: compare first half accuracy to second half
  const midpoint = new Date(since.getTime() + (Date.now() - since.getTime()) / 2)
  const firstHalf = events.filter(e => e.createdAt < midpoint)
  const secondHalf = events.filter(e => e.createdAt >= midpoint)
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE'

  if (firstHalf.length >= 10 && secondHalf.length >= 10) {
    const firstAccuracy = firstHalf.filter(e => e.decisionMatchedAi).length / firstHalf.length
    const secondAccuracy = secondHalf.filter(e => e.decisionMatchedAi).length / secondHalf.length
    if (secondAccuracy - firstAccuracy > 0.05) trend = 'IMPROVING'
    else if (firstAccuracy - secondAccuracy > 0.05) trend = 'DECLINING'
  }

  return {
    totalEvents: events.length,
    accuracyRate: Math.round((matched / events.length) * 100) / 100,
    falseApprovalRate: Math.round((falseApprovals / events.length) * 100) / 100,
    falseRejectionRate: Math.round((falseRejections / events.length) * 100) / 100,
    avgScoreGap: Math.round(avgGap * 100) / 100,
    byCategory,
    byDirtyLevel,
    trend,
  }
}
