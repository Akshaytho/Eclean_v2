/**
 * Adversarial AI Service — Fraud detection using OpenAI gpt-4o-mini
 */

import OpenAI from 'openai'
import { z } from 'zod'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || 'not-configured' })

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

const SYSTEM_PROMPT = `You are a FRAUD DETECTION AI for eClean. Your ONLY job is to find reasons work might be fraudulent. You are skeptical by default. Check for: identical photos, wrong locations, AI-generated images, impossible timestamps. You are NOT judging cleaning quality — only AUTHENTICITY. Return ONLY valid JSON.`

export async function adversarialCheck(taskId: string): Promise<AdversarialResult> {
  if (!env.OPENAI_API_KEY) {
    return { fraudProbability: 0, confidence: 0, anomalies: [], recommendation: 'PASS', reasoning: 'Adversarial check unavailable — no API key' }
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { referencePoints: true, workerSubmissions: true },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  const motionSummary = await prisma.taskMotionSummary.findUnique({ where: { taskId } })
  const envCaptures = await prisma.workerEnvironmentCapture.findMany({ where: { taskId } })

  // Build verification pairs
  const verificationPairs = task.referencePoints
    .filter((p) => p.isVerificationPoint)
    .map((rp) => {
      const sub = task.workerSubmissions.find((s) => s.referencePointId === rp.id)
      return { rp, sub }
    })
    .filter((p) => p.sub != null)

  const imageMessages = verificationPairs.flatMap((pair) => [
    { type: 'image_url' as const, image_url: { url: pair.rp.buyerImageUrl } },
    { type: 'image_url' as const, image_url: { url: pair.sub!.imageUrl } },
  ])

  const evidence = {
    taskDescription: task.description,
    category: task.category,
    timeSpentSecs: task.timeSpentSecs,
    totalReferencePoints: task.referencePoints.length,
    totalSubmissions: task.workerSubmissions.length,
    gpsScores: task.workerSubmissions.map((s) => s.locationMatchScore).filter(Boolean),
    motionData: motionSummary ? { cleaningPct: motionSummary.cleaningPct, standingPct: motionSummary.standingPct, vehiclePct: motionSummary.vehiclePct } : null,
    envMatchScores: envCaptures.map((e) => e.matchScore).filter(Boolean),
  }

  const prompt = `Analyze this task for fraud. Evidence: ${JSON.stringify(evidence)}. ${imageMessages.length > 0 ? `${imageMessages.length / 2} image pair(s): buyer reference then worker submission.` : 'No images.'} Return ONLY JSON: {"fraudProbability":0.1,"confidence":0.8,"anomalies":[],"recommendation":"PASS","reasoning":"..."}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [...imageMessages, { type: 'text' as const, text: prompt }] },
      ],
    })

    const text = response.choices[0]?.message?.content
    if (!text) throw new Error('Empty response')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = AdversarialResultSchema.parse(JSON.parse(jsonMatch[0]))

    await prisma.task.update({
      where: { id: taskId },
      data: { adversarialScore: result.fraudProbability, adversarialAnomalies: JSON.stringify(result.anomalies) },
    })

    return result
  } catch (err) {
    logger.error({ taskId, err }, 'Adversarial AI check failed')
    return { fraudProbability: 0, confidence: 0, anomalies: [], recommendation: 'PASS', reasoning: 'Adversarial check failed — defaulting to pass' }
  }
}
