/**
 * Rule Engine — Pluggable Task Confidence Scoring
 *
 * ARCHITECTURE:
 * The engine runs a pipeline of ScoringLayer functions. Each layer:
 *   1. Receives the full evidence context
 *   2. Returns a score (0 to its maxPoints) + explanation
 *   3. Can be enabled/disabled via config
 *
 * ADDING FUTURE LAYERS (EnvDNA, Motion, Citizen Mesh, etc.):
 *   1. Write a new ScoringLayer function
 *   2. Add it to SCORING_LAYERS array with its config
 *   3. Done — no other code changes needed
 *
 * RECALIBRATION:
 *   Weights are in SCORING_LAYERS config. After 200 real tasks,
 *   query ruleEngineBreakdown JSON, correlate with outcomes,
 *   and adjust maxPoints values here. One file, one change.
 */

import type { Task, TaskReferencePoint, WorkerPointSubmission } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoringContext {
  task: Task
  referencePoints: TaskReferencePoint[]
  submissions: WorkerPointSubmission[]
  // Future extension points — add new evidence types here
  environmentMatch?: number | null       // EnvDNA match score (0-100), Phase 6
  motionSummary?: MotionSummaryData | null // Motion signature data, Phase 6
  citizenVerifications?: CitizenVerificationData[] | null // Citizen mesh, Phase 7
}

export interface MotionSummaryData {
  cleaningPct: number
  walkingPct: number
  standingPct: number
  vehiclePct: number
  totalWindows: number
  durationSecs: number
}

export interface CitizenVerificationData {
  rating: 'CLEAN' | 'PARTIALLY_CLEAN' | 'DIRTY'
  hasPhoto: boolean
  matchesWorker: boolean | null
}

export interface LayerResult {
  layerId: string
  score: number
  maxPoints: number
  explanation: string
}

export interface ScoringLayerConfig {
  id: string
  name: string
  maxPoints: number
  enabled: boolean
  category: 'core' | 'bonus'   // core = always scored, bonus = only adds (never penalizes)
  fn: (ctx: ScoringContext) => LayerResult
}

export interface RuleEngineResult {
  score: number
  maxPossible: number
  normalizedScore: number   // 0-100, accounting for only enabled layers
  breakdown: Record<string, { score: number; max: number; explanation: string }>
  decision: 'AUTO_PASS' | 'MANUAL_REVIEW' | 'REJECT'
  flags: string[]
}

// ─── Decision Thresholds (configurable) ──────────────────────────────────────

export const DECISION_THRESHOLDS = {
  AUTO_PASS: 85,
  MANUAL_REVIEW: 65,
  // Below MANUAL_REVIEW = REJECT
} as const

// ─── Scoring Layers ──────────────────────────────────────────────────────────
// Each layer is a pure function. Add new layers here — that's it.

const verificationCompletenessLayer: ScoringLayerConfig = {
  id: 'verification_completeness',
  name: 'Verification Completeness',
  maxPoints: 20,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    const verPoints = ctx.referencePoints.filter((p) => p.isVerificationPoint)
    const verDone = ctx.submissions.filter((s) => s.mediaType === 'VERIFICATION')

    if (verPoints.length === 0) {
      return { layerId: 'verification_completeness', score: 20, maxPoints: 20, explanation: 'No verification points required' }
    }

    const ratio = Math.min(verDone.length / verPoints.length, 1)
    const score = Math.round(ratio * 20)
    return {
      layerId: 'verification_completeness',
      score,
      maxPoints: 20,
      explanation: `${verDone.length}/${verPoints.length} verification photos completed`,
    }
  },
}

const photoCoverageLayer: ScoringLayerConfig = {
  id: 'photo_coverage',
  name: 'Photo Coverage',
  maxPoints: 25,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    const afterSubs = ctx.submissions.filter((s) => s.mediaType === 'AFTER')
    const total = ctx.referencePoints.length

    if (total === 0) {
      return { layerId: 'photo_coverage', score: 25, maxPoints: 25, explanation: 'No reference points (legacy task)' }
    }

    const ratio = Math.min(afterSubs.length / total, 1)
    const score = Math.round(ratio * 25)
    return {
      layerId: 'photo_coverage',
      score,
      maxPoints: 25,
      explanation: `${afterSubs.length}/${total} reference points covered`,
    }
  },
}

const gpsProximityLayer: ScoringLayerConfig = {
  id: 'gps_proximity',
  name: 'GPS Proximity',
  maxPoints: 25,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    const scores = ctx.submissions
      .map((s) => s.locationMatchScore)
      .filter((s): s is number => s !== null)

    if (scores.length === 0) {
      return { layerId: 'gps_proximity', score: 0, maxPoints: 25, explanation: 'No GPS data available' }
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const score = Math.round((avg / 100) * 25)
    const avgRounded = Math.round(avg)
    return {
      layerId: 'gps_proximity',
      score,
      maxPoints: 25,
      explanation: `Average GPS match: ${avgRounded}/100 across ${scores.length} photos`,
    }
  },
}

const timeOnSiteLayer: ScoringLayerConfig = {
  id: 'time_on_site',
  name: 'Time on Site',
  maxPoints: 15,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    const durationSecs = ctx.task.workDurationSecs ?? ctx.task.timeSpentSecs
    if (!durationSecs || durationSecs <= 0) {
      return { layerId: 'time_on_site', score: 0, maxPoints: 15, explanation: 'No time data recorded' }
    }

    const minutes = durationSecs / 60
    // Expected: at least 5 min, or 3 min per reference point, whichever is larger
    const expectedMin = Math.max(5, ctx.referencePoints.length * 3)
    const ratio = Math.min(minutes / expectedMin, 1)
    const score = Math.round(ratio * 15)
    return {
      layerId: 'time_on_site',
      score,
      maxPoints: 15,
      explanation: `${Math.round(minutes)} min on site (expected ~${expectedMin} min)`,
    }
  },
}

const duplicateImageLayer: ScoringLayerConfig = {
  id: 'duplicate_image_check',
  name: 'Duplicate Image Check',
  maxPoints: 15,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    // Check if worker submitted the SAME image as buyer's reference
    // Compare by URL (exact match = copied/reused) or photoHash
    const buyerUrls = new Set(ctx.referencePoints.map((p) => p.buyerImageUrl))
    const duplicates = ctx.submissions.filter((s) => buyerUrls.has(s.imageUrl))

    // Also check photoHash duplicates among worker submissions
    const workerHashes = ctx.submissions.map((s) => s.photoHash).filter(Boolean)
    const hashDuplicates = workerHashes.filter((h, i) => workerHashes.indexOf(h) !== i)

    const totalDuplicates = duplicates.length + hashDuplicates.length

    if (totalDuplicates > 0) {
      return {
        layerId: 'duplicate_image_check',
        score: 0,
        maxPoints: 15,
        explanation: `FRAUD: ${duplicates.length} worker photo(s) are identical to buyer reference photos. ${hashDuplicates.length} duplicate hashes detected.`,
      }
    }

    return { layerId: 'duplicate_image_check', score: 15, maxPoints: 15, explanation: 'All worker photos are unique' }
  },
}

const fraudFlagsLayer: ScoringLayerConfig = {
  id: 'fraud_flags',
  name: 'GPS Fraud Flags',
  maxPoints: 10,
  enabled: true,
  category: 'core',
  fn: (ctx) => {
    const flagged = ctx.submissions.filter(
      (s) => s.locationMatchScore !== null && s.locationMatchScore < 25,
    ).length

    const score = Math.max(0, 10 - flagged * 4)
    const explanation = flagged === 0
      ? 'No GPS fraud flags detected'
      : `${flagged} photo(s) with low GPS match (<25/100)`

    return { layerId: 'fraud_flags', score, maxPoints: 10, explanation }
  },
}

// ─── Future Bonus Layers (disabled until data justifies) ─────────────────────
// These are pre-wired placeholders. Enable by setting enabled: true and
// providing the corresponding data in ScoringContext.

const environmentDNALayer: ScoringLayerConfig = {
  id: 'env_dna',
  name: 'Environmental DNA Match',
  maxPoints: 5,
  enabled: true,    // Active — bonus only, never penalizes
  category: 'bonus',
  fn: (ctx) => {
    const match = ctx.environmentMatch
    if (match == null) {
      return { layerId: 'env_dna', score: 0, maxPoints: 5, explanation: 'No environmental data' }
    }
    const score = match > 80 ? 5 : 0
    return {
      layerId: 'env_dna',
      score,
      maxPoints: 5,
      explanation: match > 80
        ? `Environmental fingerprint match: ${Math.round(match)}%`
        : `Environmental match below threshold: ${Math.round(match)}%`,
    }
  },
}

const motionSignatureLayer: ScoringLayerConfig = {
  id: 'motion_signature',
  name: 'Motion Signature',
  maxPoints: 5,
  enabled: true,    // Active — bonus only, never penalizes
  category: 'bonus',
  fn: (ctx) => {
    const motion = ctx.motionSummary
    if (!motion) {
      return { layerId: 'motion_signature', score: 0, maxPoints: 5, explanation: 'No motion data' }
    }
    // Bonus only — never penalizes (per design decision)
    const score = motion.cleaningPct > 0.5 ? 5 : 0
    return {
      layerId: 'motion_signature',
      score,
      maxPoints: 5,
      explanation: score > 0
        ? `Cleaning activity: ${Math.round(motion.cleaningPct * 100)}% of task duration`
        : `Low cleaning activity: ${Math.round(motion.cleaningPct * 100)}%`,
    }
  },
}

const citizenMeshLayer: ScoringLayerConfig = {
  id: 'citizen_mesh',
  name: 'Citizen Mesh Verification',
  maxPoints: 5,
  enabled: true,    // Active — bonus only, never penalizes
  category: 'bonus',
  fn: (ctx) => {
    const verifications = ctx.citizenVerifications
    if (!verifications || verifications.length === 0) {
      return { layerId: 'citizen_mesh', score: 0, maxPoints: 5, explanation: 'No citizen verifications yet' }
    }
    const cleanCount = verifications.filter((v) => v.rating === 'CLEAN').length
    const score = cleanCount > 0 ? 5 : 0
    return {
      layerId: 'citizen_mesh',
      score,
      maxPoints: 5,
      explanation: `${cleanCount}/${verifications.length} citizens confirmed area is clean`,
    }
  },
}

// ─── Layer Registry ──────────────────────────────────────────────────────────
// Order matters: core layers first, bonus layers after.
// To add a new layer: just push to this array.

export const SCORING_LAYERS: ScoringLayerConfig[] = [
  // Core layers (always active)
  verificationCompletenessLayer,
  photoCoverageLayer,
  gpsProximityLayer,
  timeOnSiteLayer,
  duplicateImageLayer,
  fraudFlagsLayer,
  // Bonus layers (enable when ready)
  environmentDNALayer,
  motionSignatureLayer,
  citizenMeshLayer,
]

// ─── Engine ──────────────────────────────────────────────────────────────────

export function computeTaskConfidence(ctx: ScoringContext): RuleEngineResult {
  const enabledLayers = SCORING_LAYERS.filter((l) => l.enabled)
  const results: LayerResult[] = enabledLayers.map((layer) => layer.fn(ctx))

  const totalScore = results.reduce((sum, r) => sum + r.score, 0)
  const maxPossible = enabledLayers.reduce((sum, l) => sum + l.maxPoints, 0)

  // Normalize to 0-100 (in case bonus layers push above 100)
  const normalizedScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0

  const breakdown: Record<string, { score: number; max: number; explanation: string }> = {}
  for (const r of results) {
    breakdown[r.layerId] = { score: r.score, max: r.maxPoints, explanation: r.explanation }
  }

  // Collect flags
  const flags: string[] = []
  const fraudResult = results.find((r) => r.layerId === 'fraud_flags')
  if (fraudResult && fraudResult.score < 10) flags.push('LOW_GPS_MATCH')
  const timeResult = results.find((r) => r.layerId === 'time_on_site')
  if (timeResult && timeResult.score < 5) flags.push('LOW_TIME_ON_SITE')
  const coverageResult = results.find((r) => r.layerId === 'photo_coverage')
  if (coverageResult && coverageResult.score < 13) flags.push('LOW_COVERAGE')

  // Decision
  let decision: 'AUTO_PASS' | 'MANUAL_REVIEW' | 'REJECT'
  if (normalizedScore >= DECISION_THRESHOLDS.AUTO_PASS) {
    decision = 'AUTO_PASS'
  } else if (normalizedScore >= DECISION_THRESHOLDS.MANUAL_REVIEW) {
    decision = 'MANUAL_REVIEW'
  } else {
    decision = 'REJECT'
  }

  return {
    score: totalScore,
    maxPossible,
    normalizedScore,
    breakdown,
    decision,
    flags,
  }
}

// ─── Utility: Build context from DB data ─────────────────────────────────────
// Convenience function for callers who just have a taskId.

import { prisma } from '../../lib/prisma'

export async function computeConfidenceForTask(taskId: string): Promise<RuleEngineResult> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new Error(`Task ${taskId} not found`)

  const [referencePoints, submissions, envCaptures, motionSummary] = await Promise.all([
    prisma.taskReferencePoint.findMany({ where: { taskId } }),
    prisma.workerPointSubmission.findMany({ where: { taskId } }),
    prisma.workerEnvironmentCapture.findMany({
      where: { taskId },
      orderBy: { matchScore: 'desc' },
      take: 1,
    }),
    prisma.taskMotionSummary.findUnique({ where: { taskId } }),
  ])

  // Best environment match score
  const environmentMatch = envCaptures[0]?.matchScore ?? null

  // Motion summary data
  const motionData = motionSummary ? {
    cleaningPct: motionSummary.cleaningPct,
    walkingPct: motionSummary.walkingPct,
    standingPct: motionSummary.standingPct,
    vehiclePct: motionSummary.vehiclePct,
    totalWindows: motionSummary.totalWindows,
    durationSecs: motionSummary.durationSecs,
  } : null

  return computeTaskConfidence({
    task,
    referencePoints,
    submissions,
    environmentMatch,
    motionSummary: motionData,
  })
}
