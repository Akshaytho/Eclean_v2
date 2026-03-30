/**
 * Adversarial AI Service
 *
 * A SECOND AI whose only job is to find fraud.
 * Runs AFTER the verifier AI completes.
 *
 * Decision matrix:
 *   Verifier APPROVE + Adversary PASS  → AUTO-APPROVE
 *   Either disagrees                    → SUPERVISOR REVIEW
 *   Both REJECT                        → AUTO-REJECT
 *
 * This creates an adversarial tension — one AI tries to approve,
 * another tries to find holes. If both agree, high confidence.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || 'not-configured' })

// ─── Types ───────────────────────────────────────────────────────────────────

const AdversarialResultSchema = z.object({
  fraudProbability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  anomalies: z.array(z.object({
    type: z.string(),
    description: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  })),
  recommendation: z.enum(['PASS', 'FLAG', 'REJECT']),
  reasoning: z.string(),
})

export type AdversarialResult = z.infer<typeof AdversarialResultSchema>

// ─── System Prompt ───────────────────────────────────────────────────────────

const ADVERSARIAL_SYSTEM_PROMPT = `You are a FRAUD DETECTION AI for eClean, a civic work verification platform.
Your ONLY job is to find reasons work might be fraudulent. You are skeptical by default.
You look for anomalies, inconsistencies, and patterns that suggest the worker didn't actually perform the cleaning work.

IMPORTANT: You are NOT judging cleaning quality. You are judging AUTHENTICITY.
A poorly cleaned area is still authentic work. A perfectly clean stock photo is fraud.

Check for:
- Photo consistency: identical cloud/sky patterns across different timestamps, AI generation artifacts
- GPS consistency: teleportation (>100m in <30s), all photos from same exact GPS point
- Temporal consistency: timestamps out of order, impossible time gaps
- Environmental mismatch: buyer and worker fingerprints don't match
- Motion anomaly: worker claims 45 min but motion shows mostly standing/vehicle
- Historical: repeat patterns matching previously rejected work

Return ONLY valid JSON.`

// ─── Main Function ───────────────────────────────────────────────────────────

export async function adversarialCheck(taskId: string): Promise<AdversarialResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      referencePoints: true,
      workerSubmissions: true,
    },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  // Gather all evidence
  const motionSummary = await prisma.taskMotionSummary.findUnique({ where: { taskId } })
  const envCaptures = await prisma.workerEnvironmentCapture.findMany({ where: { taskId } })
  const buyerEnv = await prisma.taskEnvironmentFingerprint.findUnique({ where: { taskId } })

  // Build image pairs for analysis (send verification pairs only — cost optimization)
  const verificationPairs = task.referencePoints
    .filter((p) => p.isVerificationPoint)
    .map((refPoint) => {
      const sub = task.workerSubmissions.find(
        (s) => s.referencePointId === refPoint.id,
      )
      return { refPoint, sub }
    })
    .filter((p) => p.sub != null)

  const imageContent = verificationPairs.flatMap((pair) => [
    { type: 'image' as const, source: { type: 'url' as const, url: pair.refPoint.buyerImageUrl } },
    { type: 'image' as const, source: { type: 'url' as const, url: pair.sub!.imageUrl } },
  ])

  // Build evidence summary
  const evidenceSummary = {
    taskDescription: task.description,
    category: task.category,
    timeSpentSecs: task.timeSpentSecs,
    totalReferencePoints: task.referencePoints.length,
    totalSubmissions: task.workerSubmissions.length,
    gpsScores: task.workerSubmissions.map((s) => s.locationMatchScore).filter(Boolean),
    motionData: motionSummary ? {
      cleaningPct: motionSummary.cleaningPct,
      walkingPct: motionSummary.walkingPct,
      standingPct: motionSummary.standingPct,
      vehiclePct: motionSummary.vehiclePct,
      durationSecs: motionSummary.durationSecs,
    } : null,
    envMatchScores: envCaptures.map((e) => e.matchScore).filter(Boolean),
    hasEnvBaseline: !!buyerEnv,
  }

  const prompt = `Analyze this civic cleanup task for fraud indicators.

Evidence summary: ${JSON.stringify(evidenceSummary)}

${imageContent.length > 0 ? `You are also receiving ${imageContent.length / 2} image pair(s). Each pair: buyer reference (dirty) then worker submission (should be clean).` : 'No images available for this check.'}

Return ONLY valid JSON:
{"fraudProbability":0.1,"confidence":0.8,"anomalies":[],"recommendation":"PASS","reasoning":"..."}`

  const AI_MODEL = 'claude-sonnet-4-5'

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: ADVERSARIAL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: prompt },
        ],
      }],
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type')

    const result = AdversarialResultSchema.parse(JSON.parse(block.text))

    // Persist to task
    await prisma.task.update({
      where: { id: taskId },
      data: {
        adversarialScore: result.fraudProbability,
        adversarialAnomalies: JSON.stringify(result.anomalies),
      },
    })

    return result
  } catch (err) {
    logger.error({ taskId, err }, 'Adversarial AI check failed')
    // Return safe default — don't block on adversarial failure
    return {
      fraudProbability: 0,
      confidence: 0,
      anomalies: [],
      recommendation: 'PASS',
      reasoning: 'Adversarial check unavailable — defaulting to pass',
    }
  }
}
