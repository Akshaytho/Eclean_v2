// eClean — Multi-Dimensional Scoring Engine
//
// The brain of the verification system. Takes raw dimension scores from
// Claude Vision and transforms them into a final verification decision.
//
// Unlike the old system (single 0-1 score), this engine:
// 1. Weights scores by category (drain cleaning values safety more than street cleaning)
// 2. Applies worker trust modifiers (trusted workers get benefit of doubt)
// 3. Integrates fraud signals as score penalties
// 4. Computes confidence (how certain is the engine about its decision)
// 5. Makes the APPROVE/REVIEW/REJECT decision with clear thresholds
//
// The final decision considers ALL layers, not just the AI score.
// A high AI score can still get REVIEW if fraud signals are present.
// A medium AI score can still get APPROVE if worker is EXPERT tier with clean history.

import type { DirtyLevel, TaskCategory } from '@prisma/client'
import { getCategoryWeights } from './prompts'
import type { FraudReport } from './fraud-engine'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DimensionScores {
  cleanlinessScore: number
  workEvidenceScore: number
  completenessScore: number
  safetyScore: number
  photoQualityScore: number
}

export interface AiRawResponse {
  cleanlinessScore: number
  workEvidenceScore: number
  completenessScore: number
  safetyScore: number
  photoQualityScore: number
  workEvident: boolean
  suspiciousActivity: boolean
  locationConsistent: boolean
  reasoning: string
  categoryNotes: string | null
  improvementSuggestions: string | null
}

export interface ScoringContext {
  category: TaskCategory
  dirtyLevel: DirtyLevel
  workerTrustScore: number
  workerTrustTier: string
  fraudReport: FraudReport
  photoSetQualityScore: number
  attemptNumber: number
}

export interface ScoringResult {
  /** Weighted composite score 0.0-1.0 */
  finalScore: number
  /** APPROVE, REVIEW, REJECT */
  recommendation: string
  /** 0.0-1.0 how confident the engine is in this decision */
  confidence: number
  /** EXCELLENT, GOOD, ACCEPTABLE, POOR, FAILED */
  label: string
  /** Detailed breakdown of how the score was computed */
  scoreBreakdown: {
    rawWeightedScore: number
    trustModifier: number
    fraudPenalty: number
    qualityModifier: number
    resubmissionModifier: number
    finalAdjusted: number
  }
}

// ─── Decision Thresholds ────────────────────────────────────────────────────
// These are the core thresholds that determine APPROVE/REVIEW/REJECT.
// They are intentionally tight — false approvals cost more than false rejects
// because they directly release payment.

const THRESHOLDS = {
  APPROVE_MIN: 0.70,      // minimum score for auto-approve
  REVIEW_MIN:  0.45,      // minimum score for manual review (below = reject)
  FRAUD_OVERRIDE: 0.50,   // if fraud score >= this, force to REVIEW regardless
  CONFIDENCE_MIN: 0.40,   // if confidence < this, force to REVIEW
}

// ─── Trust Tier Modifiers ───────────────────────────────────────────────────
// How much the worker's trust tier adjusts the effective threshold.
// Positive = more lenient (lower threshold), Negative = stricter (higher threshold)

const TRUST_MODIFIERS: Record<string, number> = {
  FLAGGED:  -0.10,   // stricter: need 0.80 to auto-approve
  NEW:       0.00,   // standard
  BUILDING:  0.00,   // standard
  TRUSTED:  +0.05,   // slightly lenient: 0.65 can auto-approve
  EXPERT:   +0.08,   // lenient: 0.62 can auto-approve
}

// ─── Dirty Level Tolerance ──────────────────────────────────────────────────
// CRITICAL tasks are harder to clean perfectly. The engine should be
// more forgiving of imperfect results on CRITICAL tasks vs LIGHT ones.

const DIRTY_LEVEL_TOLERANCE: Record<DirtyLevel, number> = {
  LIGHT:    0.00,  // no tolerance — light tasks should be cleaned perfectly
  MEDIUM:   0.02,  // slight tolerance
  HEAVY:    0.05,  // moderate tolerance — some residual marks expected
  CRITICAL: 0.08,  // significant tolerance — any improvement is valuable
}

// ─── Compute Final Score ────────────────────────────────────────────────────

export function computeScore(
  aiResponse: AiRawResponse,
  context: ScoringContext,
): ScoringResult {
  const weights = getCategoryWeights(context.category)

  // Step 1: Compute raw weighted score from dimension scores
  const rawWeightedScore = (
    aiResponse.cleanlinessScore  * weights.cleanliness +
    aiResponse.workEvidenceScore * weights.workEvidence +
    aiResponse.completenessScore * weights.completeness +
    aiResponse.safetyScore       * weights.safety +
    aiResponse.photoQualityScore * weights.photoQuality
  )

  // Step 2: Apply trust modifier
  const trustMod = TRUST_MODIFIERS[context.workerTrustTier] ?? 0
  const trustModifier = trustMod

  // Step 3: Apply fraud penalty
  // Fraud score directly reduces the final score. A 0.8 fraud score
  // takes 40% off the verification score (0.8 * 0.5 = 0.4 penalty).
  const fraudPenalty = context.fraudReport.fraudScore * 0.5

  // Step 4: Apply photo quality modifier
  // Poor photo quality = lower confidence, not necessarily lower score.
  // But extremely poor quality (< 0.3) does penalize the score.
  const qualityModifier = context.photoSetQualityScore < 0.3
    ? -(0.3 - context.photoSetQualityScore) * 0.3
    : 0

  // Step 5: Resubmission modifier
  // If this is a re-submission (attempt > 1), the worker addressed previous feedback.
  // Give a small boost to acknowledge effort, but don't over-reward.
  const resubmissionModifier = context.attemptNumber > 1 ? 0.03 : 0

  // Step 6: Dirty level tolerance
  const dirtyTolerance = DIRTY_LEVEL_TOLERANCE[context.dirtyLevel] ?? 0

  // Compute final adjusted score
  let finalAdjusted = rawWeightedScore + trustModifier - fraudPenalty + qualityModifier + resubmissionModifier + dirtyTolerance

  // Clamp
  finalAdjusted = Math.min(1.0, Math.max(0.0, finalAdjusted))
  finalAdjusted = Math.round(finalAdjusted * 1000) / 1000

  // Step 7: Compute confidence
  const confidence = computeConfidence(aiResponse, context, rawWeightedScore, finalAdjusted)

  // Step 8: Make decision
  const { recommendation, label } = makeDecision(finalAdjusted, confidence, context, aiResponse)

  return {
    finalScore: finalAdjusted,
    recommendation,
    confidence,
    label,
    scoreBreakdown: {
      rawWeightedScore: Math.round(rawWeightedScore * 1000) / 1000,
      trustModifier: Math.round(trustModifier * 1000) / 1000,
      fraudPenalty: Math.round(fraudPenalty * 1000) / 1000,
      qualityModifier: Math.round(qualityModifier * 1000) / 1000,
      resubmissionModifier,
      finalAdjusted,
    },
  }
}

// ─── Confidence Computation ─────────────────────────────────────────────────

function computeConfidence(
  aiResponse: AiRawResponse,
  context: ScoringContext,
  rawScore: number,
  finalScore: number,
): number {
  let confidence = 0.8 // base confidence

  // Dimension score agreement: if all dimensions roughly agree, high confidence
  const scores = [
    aiResponse.cleanlinessScore,
    aiResponse.workEvidenceScore,
    aiResponse.completenessScore,
    aiResponse.safetyScore,
    aiResponse.photoQualityScore,
  ]
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
  // Low variance = dimensions agree = higher confidence
  if (variance < 0.02) confidence += 0.10
  else if (variance < 0.05) confidence += 0.05
  else if (variance > 0.10) confidence -= 0.10

  // Score in the "gray zone" (0.45-0.75) = lower confidence
  if (finalScore >= 0.45 && finalScore <= 0.75) {
    confidence -= 0.10
  }

  // Fraud signals reduce confidence
  if (context.fraudReport.signals.length > 0) {
    confidence -= Math.min(0.15, context.fraudReport.signals.length * 0.03)
  }

  // Work evident + no suspicious = boost confidence
  if (aiResponse.workEvident && !aiResponse.suspiciousActivity && aiResponse.locationConsistent) {
    confidence += 0.05
  }

  // AI detected suspicious but score is high = conflicting signals = low confidence
  if (aiResponse.suspiciousActivity && rawScore > 0.7) {
    confidence -= 0.15
  }

  // Location inconsistency is a major confidence reducer
  if (!aiResponse.locationConsistent) {
    confidence -= 0.15
  }

  // Photo quality affects confidence
  if (context.photoSetQualityScore < 0.4) {
    confidence -= 0.10
  }

  // Worker with high trust increases confidence
  if (context.workerTrustTier === 'EXPERT') confidence += 0.05
  if (context.workerTrustTier === 'FLAGGED') confidence -= 0.05

  return Math.min(1.0, Math.max(0.1, Math.round(confidence * 100) / 100))
}

// ─── Decision Logic ─────────────────────────────────────────────────────────

function makeDecision(
  finalScore: number,
  confidence: number,
  context: ScoringContext,
  aiResponse: AiRawResponse,
): { recommendation: string; label: string } {
  // Override rules (checked first)

  // Rule 1: High fraud score → always REVIEW
  if (context.fraudReport.fraudScore >= THRESHOLDS.FRAUD_OVERRIDE) {
    return { recommendation: 'REVIEW', label: scoreToLabel(finalScore) }
  }

  // Rule 2: AI detected suspicious + location inconsistent → REVIEW
  if (aiResponse.suspiciousActivity && !aiResponse.locationConsistent) {
    return { recommendation: 'REVIEW', label: scoreToLabel(finalScore) }
  }

  // Rule 3: Low confidence → REVIEW
  if (confidence < THRESHOLDS.CONFIDENCE_MIN) {
    return { recommendation: 'REVIEW', label: scoreToLabel(finalScore) }
  }

  // Rule 4: No work evident → REJECT (regardless of scores)
  if (!aiResponse.workEvident && finalScore < 0.85) {
    return { recommendation: 'REJECT', label: 'FAILED' }
  }

  // Standard threshold-based decision
  const trustMod = TRUST_MODIFIERS[context.workerTrustTier] ?? 0
  const effectiveApproveThreshold = THRESHOLDS.APPROVE_MIN - trustMod
  const effectiveReviewThreshold = THRESHOLDS.REVIEW_MIN - trustMod

  if (finalScore >= effectiveApproveThreshold) {
    return { recommendation: 'APPROVE', label: scoreToLabel(finalScore) }
  }

  if (finalScore >= effectiveReviewThreshold) {
    return { recommendation: 'REVIEW', label: scoreToLabel(finalScore) }
  }

  return { recommendation: 'REJECT', label: scoreToLabel(finalScore) }
}

function scoreToLabel(score: number): string {
  if (score >= 0.90) return 'EXCELLENT'
  if (score >= 0.75) return 'GOOD'
  if (score >= 0.55) return 'ACCEPTABLE'
  if (score >= 0.35) return 'POOR'
  return 'FAILED'
}
