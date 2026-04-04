/**
 * AI Verification Service — Provider-agnostic wrapper
 *
 * Single merged call: verification + fraud detection in one JSON response
 * Provider: configurable (OpenAI by default, can swap to Anthropic/custom)
 * Fallback: parse failure or timeout → MANUAL_REVIEW (never auto-pass on failure)
 *
 * Cost: ~$0.04-0.06 per verification (ALL pairs at 1024px, gpt-4o, detail:high)
 * Budget: ₹5/task (~$0.06) — deducted from buyer payment
 */

import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { OpenAIProvider } from './openai.provider'
import type { AIVerificationProvider, VerificationImage, VerificationMetadata, VerificationResult } from './verification.interface'
import { checkPhotoSimilarity } from '../verification/photo-similarity'

// ─── Provider Selection (swap here to change AI provider) ────────────────────

function getProvider(): AIVerificationProvider {
  return new OpenAIProvider()
  // Future: return new AnthropicProvider()
  // Future: return new CustomModelProvider()
}

// ─── Legacy Types (kept for backward compatibility with existing code) ───────

const AiResultSchema = z.object({
  score:              z.number().min(0).max(1),
  label:              z.enum(['EXCELLENT', 'GOOD', 'UNCERTAIN', 'POOR']),
  reasoning:          z.string(),
  workEvident:        z.boolean(),
  suspiciousActivity: z.boolean(),
  recommendation:     z.enum(['APPROVE', 'REVIEW', 'REJECT']),
})

export type AiVerificationResult = z.infer<typeof AiResultSchema>

// ─── Main Function ───────────────────────────────────────────────────────────

const MAX_RETRIES = 2

export async function verifyTaskSubmission(taskId: string): Promise<AiVerificationResult> {
  // Rule engine < 40 → human review queue, don't waste AI cost
  const preCheck = await prisma.task.findUnique({ where: { id: taskId }, select: { ruleEngineScore: true } })
  if (preCheck?.ruleEngineScore != null && preCheck.ruleEngineScore < 40) {
    const reviewResult: AiVerificationResult = {
      score: 0.25, label: 'POOR',
      reasoning: 'Rule engine score below 40 — flagged for supervisor review (possible GPS drift or legitimate issue)',
      workEvident: false, suspiciousActivity: true, recommendation: 'REVIEW',
    }
    await prisma.task.update({
      where: { id: taskId },
      data: { aiScore: reviewResult.score, aiReasoning: reviewResult.reasoning, aiModelVersion: 'human-review-queue', finalDecision: 'MANUAL_REVIEW' },
    })
    return reviewResult
  }

  // ─── PRE-AI GATE 1: Motion Activity Check (₹0, instant) ─────────────────
  // If worker sat still the entire time, skip AI call and save ₹1.5
  const motionSummary = await prisma.taskMotionSummary.findUnique({ where: { taskId } })
  if (motionSummary && motionSummary.durationSecs > 600) { // only gate if >10 min of data
    if (motionSummary.cleaningPct < 0.05 && motionSummary.standingPct > 0.80) {
      logger.warn({ taskId, cleaningPct: motionSummary.cleaningPct, standingPct: motionSummary.standingPct },
        'Motion gate: worker was stationary >80% with <5% cleaning — skipping AI')
      const motionReject: AiVerificationResult = {
        score: 0.15, label: 'POOR',
        reasoning: `Motion data shows ${Math.round(motionSummary.standingPct * 100)}% stationary, only ${Math.round(motionSummary.cleaningPct * 100)}% cleaning activity. Worker appears to have not performed physical work.`,
        workEvident: false, suspiciousActivity: true, recommendation: 'REJECT',
      }
      await prisma.task.update({
        where: { id: taskId },
        data: { aiScore: motionReject.score, aiReasoning: motionReject.reasoning, aiModelVersion: 'motion-gate', finalDecision: 'MANUAL_REVIEW' },
      })
      return motionReject
    }
    if (motionSummary.vehiclePct > 0.50) {
      logger.warn({ taskId, vehiclePct: motionSummary.vehiclePct }, 'Motion gate: worker was in vehicle >50% — skipping AI')
      const vehicleReject: AiVerificationResult = {
        score: 0.10, label: 'POOR',
        reasoning: `Motion data shows ${Math.round(motionSummary.vehiclePct * 100)}% vehicle movement. Worker appears to have been driving, not cleaning.`,
        workEvident: false, suspiciousActivity: true, recommendation: 'REJECT',
      }
      await prisma.task.update({
        where: { id: taskId },
        data: { aiScore: vehicleReject.score, aiReasoning: vehicleReject.reasoning, aiModelVersion: 'motion-gate', finalDecision: 'REJECT' },
      })
      return vehicleReject
    }
  }

  // Load task with all related data
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { media: true, referencePoints: true, workerSubmissions: true },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  // ─── PRE-AI GATE 2: Photo Similarity Check (₹0, ~50ms) ─────────────────
  // If before/after photos are visually identical, worker didn't clean
  if (task.referencePoints.length > 0 && task.workerSubmissions.length > 0) {
    const pairs = task.referencePoints
      .map((rp) => {
        const sub = task.workerSubmissions.find(
          (s) => s.referencePointId === rp.id && (s.mediaType === 'AFTER' || s.mediaType === 'VERIFICATION'),
        )
        return sub ? { beforeUrl: rp.buyerImageUrl, afterUrl: sub.imageUrl, pointIndex: rp.pointIndex } : null
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (pairs.length > 0) {
      const similarity = await checkPhotoSimilarity(pairs)
      if (similarity.shouldReject) {
        logger.warn({ taskId, avgSimilarity: similarity.avgSimilarity, suspiciousPairs: similarity.suspiciousPairs },
          'Photo similarity gate: before/after images too similar — skipping AI')
        const photoReject: AiVerificationResult = {
          score: 0.10, label: 'POOR',
          reasoning: `Before/after photos are ${similarity.avgSimilarity}% visually similar (${similarity.suspiciousPairs}/${similarity.totalPairs} pairs suspicious). Images appear nearly identical — no visible cleaning work detected.`,
          workEvident: false, suspiciousActivity: true, recommendation: 'REJECT',
        }
        await prisma.task.update({
          where: { id: taskId },
          data: {
            aiScore: photoReject.score, aiReasoning: photoReject.reasoning,
            aiModelVersion: 'photo-similarity-gate', finalDecision: 'MANUAL_REVIEW',
          },
        })
        return photoReject
      }
    }
  }

  // Build images: send ALL pairs for maximum accuracy (₹5/task budget allows it)
  const images = buildImages(task)

  // Build metadata context
  const envCaptures = await prisma.workerEnvironmentCapture.findMany({ where: { taskId }, orderBy: { matchScore: 'desc' }, take: 1 })
  let zoneDirtyScore: number | null = null
  if (task.zoneId) {
    const snapshot = await prisma.analyticsZoneSnapshot.findFirst({ where: { zoneId: task.zoneId }, orderBy: { date: 'desc' } })
    zoneDirtyScore = snapshot?.dirtyScore ?? null
  }

  const metadata: VerificationMetadata = {
    taskTitle: task.title,
    taskDescription: task.description,
    taskCategory: task.category,
    dirtyLevel: task.dirtyLevel,
    timeSpentSecs: task.workDurationSecs ?? task.timeSpentSecs,
    totalReferencePoints: task.referencePoints.length,
    totalSubmissions: task.workerSubmissions.length,
    gpsScores: task.workerSubmissions.map((s) => s.locationMatchScore).filter((s): s is number => s !== null),
    motionData: motionSummary ? { cleaningPct: motionSummary.cleaningPct, standingPct: motionSummary.standingPct, vehiclePct: motionSummary.vehiclePct } : null,
    envMatchScores: envCaptures.map((e) => e.matchScore).filter((s): s is number => s !== null),
    zoneDirtyScore,
  }

  // Call AI provider with retry + fallback
  const provider = getProvider()
  let aiResult: VerificationResult | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      aiResult = await provider.verify(images, metadata)
      break
    } catch (err) {
      logger.error({ taskId, attempt, provider: provider.name, err }, 'AI verification call failed')
      if (attempt === MAX_RETRIES) {
        // FALLBACK: AI unavailable → MANUAL_REVIEW, never auto-pass
        logger.warn({ taskId }, 'AI verification exhausted retries — falling back to MANUAL_REVIEW')
        const fallbackResult: AiVerificationResult = {
          score: 0.5, label: 'UNCERTAIN',
          reasoning: 'AI verification unavailable after retries — flagged for manual review',
          workEvident: false, suspiciousActivity: false, recommendation: 'REVIEW',
        }
        await prisma.task.update({
          where: { id: taskId },
          data: { aiScore: fallbackResult.score, aiReasoning: fallbackResult.reasoning, aiModelVersion: `${provider.name}-fallback`, finalDecision: 'MANUAL_REVIEW' },
        })
        return fallbackResult
      }
    }
  }

  if (!aiResult) throw new Error('Unreachable')

  // Persist both verification + fraud results
  const verScore = aiResult.verification.score
  const fraudProb = aiResult.fraud.probability
  const model = provider.name

  await prisma.task.update({
    where: { id: taskId },
    data: {
      aiScore: verScore,
      aiReasoning: aiResult.verification.reasoning,
      aiModelVersion: model,
      adversarialScore: fraudProb,
      adversarialAnomalies: JSON.stringify(aiResult.fraud.anomalies),
    },
  })

  // Update finalDecision based on BOTH rule engine + AI + fraud + GPS trail
  const ruleScore = preCheck?.ruleEngineScore ?? 0
  let finalDecision = 'MANUAL_REVIEW'

  if (ruleScore >= 85 && verScore >= 0.75 && fraudProb < 0.3 && aiResult.verification.recommendation === 'APPROVE') {
    finalDecision = 'AUTO_PASS'
  } else if (verScore < 0.3 && ruleScore < 70) {
    // Auto-reject ONLY when BOTH signals are bad.
    // AI < 0.3 + rule ≥ 70 = worker did work but took bad photos → let buyer decide
    finalDecision = 'REJECT'
  }

  // Fraud score override: high fraud forces MANUAL_REVIEW regardless of other scores
  if (fraudProb >= 0.8 && finalDecision === 'AUTO_PASS') {
    finalDecision = 'MANUAL_REVIEW'
    logger.warn({ taskId, fraudProb, verScore, ruleScore }, 'High fraud probability overrode AUTO_PASS → MANUAL_REVIEW')
  }

  // Worker Grace: if MANUAL_REVIEW but GPS trail proves worker was present,
  // upgrade to WORKER_GRACE (12h auto-release instead of 72h)
  // Protects honest workers with budget phone GPS drift from lazy buyers
  if (finalDecision === 'MANUAL_REVIEW' && ruleScore >= 60 && verScore >= 0.3) {
    try {
      const { analyzeGPSTrail } = require('../verification/gps-trail-analysis')
      const trail = await analyzeGPSTrail(taskId)
      if (trail?.provesPresence) {
        finalDecision = 'WORKER_GRACE'
        logger.info({ taskId, presencePercent: trail.presencePercent, ruleScore, verScore },
          'Worker Grace activated — GPS trail proves presence')
      }
    } catch (err) {
      logger.error({ taskId, err }, 'GPS trail analysis failed — keeping MANUAL_REVIEW')
    }
  }

  await prisma.task.update({ where: { id: taskId }, data: { finalDecision } })

  return {
    score: verScore,
    label: aiResult.verification.label as AiVerificationResult['label'],
    reasoning: aiResult.verification.reasoning,
    workEvident: aiResult.verification.workEvident,
    suspiciousActivity: aiResult.verification.suspiciousActivity || fraudProb > 0.5,
    recommendation: aiResult.verification.recommendation as AiVerificationResult['recommendation'],
  }
}

// ─── Image Selection: send ALL pairs for maximum accuracy ───────────────────

function buildImages(task: {
  referencePoints: Array<{ id: string; pointIndex: number; label: string | null; buyerImageUrl: string; isVerificationPoint: boolean }>
  workerSubmissions: Array<{ referencePointId: string; mediaType: string; imageUrl: string; locationMatchScore: number | null }>
  media: Array<{ type: string; url: string }>
}): VerificationImage[] {
  if (task.referencePoints.length > 0 && task.workerSubmissions.length > 0) {
    // Send ALL pairs — AI sees every before/after comparison
    // Sorted by GPS score (weakest first) so AI focuses on suspicious ones
    const pairs = task.referencePoints
      .map((rp) => {
        const sub = task.workerSubmissions.find(
          (s) => s.referencePointId === rp.id && (s.mediaType === 'AFTER' || s.mediaType === 'VERIFICATION'),
        )
        return { rp, sub, gpsScore: sub?.locationMatchScore ?? 999 }
      })
      .filter((p) => p.sub != null)
      .sort((a, b) => a.gpsScore - b.gpsScore) // weakest first

    const images: VerificationImage[] = []
    for (const pair of pairs) {
      images.push(
        { url: pair.rp.buyerImageUrl, role: 'reference', pointIndex: pair.rp.pointIndex, label: pair.rp.label, gpsScore: pair.gpsScore },
        { url: pair.sub!.imageUrl, role: 'after', pointIndex: pair.rp.pointIndex, label: pair.rp.label, gpsScore: pair.gpsScore },
      )
    }
    return images
  }

  // Legacy flow: BEFORE + AFTER
  const before = task.media.find((m) => m.type === 'BEFORE')
  const after = task.media.find((m) => m.type === 'AFTER')
  if (before && after) {
    return [
      { url: before.url, role: 'reference', pointIndex: 1 },
      { url: after.url, role: 'after', pointIndex: 1 },
    ]
  }

  return []
}
