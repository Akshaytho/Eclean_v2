/**
 * AI Verification Service — Provider-agnostic wrapper
 *
 * Single merged call: verification + fraud detection in one JSON response
 * Provider: configurable (OpenAI by default, can swap to Anthropic/custom)
 * Fallback: parse failure or timeout → MANUAL_REVIEW (never auto-pass on failure)
 *
 * Cost: ~$0.0006 per verification (2 images at 768px + metadata + prompt)
 * Budget: $14 → ~23,000 verifications
 */

import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { OpenAIProvider } from './openai.provider'
import type { AIVerificationProvider, VerificationImage, VerificationMetadata, VerificationResult } from './verification.interface'

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

  // Load task with all related data
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { media: true, referencePoints: true, workerSubmissions: true },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  // Build images: send the WEAKEST pair (lowest GPS score) — catches most suspicious point
  const images = buildImages(task)

  // Build metadata context
  const motionSummary = await prisma.taskMotionSummary.findUnique({ where: { taskId } })
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

  // Update finalDecision based on BOTH rule engine + AI
  const ruleScore = preCheck?.ruleEngineScore ?? 0
  let finalDecision = 'MANUAL_REVIEW'
  if (ruleScore >= 85 && verScore >= 0.75 && fraudProb < 0.3 && aiResult.verification.recommendation === 'APPROVE') {
    finalDecision = 'AUTO_PASS'
  } else if (verScore < 0.3 || aiResult.verification.recommendation === 'REJECT') {
    // Only auto-reject when AI is very confident it's bad
    finalDecision = 'REJECT'
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

// ─── Image Selection: send the WEAKEST pair ──────────────────────────────────

function buildImages(task: {
  referencePoints: Array<{ id: string; pointIndex: number; label: string | null; buyerImageUrl: string; isVerificationPoint: boolean }>
  workerSubmissions: Array<{ referencePointId: string; mediaType: string; imageUrl: string; locationMatchScore: number | null }>
  media: Array<{ type: string; url: string }>
}): VerificationImage[] {
  if (task.referencePoints.length > 0 && task.workerSubmissions.length > 0) {
    // New flow: find the pair with LOWEST GPS score (most suspicious)
    const pairs = task.referencePoints
      .map((rp) => {
        const sub = task.workerSubmissions.find(
          (s) => s.referencePointId === rp.id && (s.mediaType === 'AFTER' || s.mediaType === 'VERIFICATION'),
        )
        return { rp, sub, gpsScore: sub?.locationMatchScore ?? 999 }
      })
      .filter((p) => p.sub != null)
      .sort((a, b) => a.gpsScore - b.gpsScore) // weakest first

    const weakest = pairs[0]
    if (weakest) {
      return [
        { url: weakest.rp.buyerImageUrl, role: 'reference', pointIndex: weakest.rp.pointIndex, label: weakest.rp.label, gpsScore: weakest.gpsScore },
        { url: weakest.sub!.imageUrl, role: 'after', pointIndex: weakest.rp.pointIndex, label: weakest.rp.label, gpsScore: weakest.gpsScore },
      ]
    }
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
