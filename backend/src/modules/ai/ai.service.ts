import OpenAI from 'openai'
import { z } from 'zod'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || 'not-configured' })

// ─── Types ────────────────────────────────────────────────────────────────────

const AiResultSchema = z.object({
  score:              z.number().min(0).max(1),
  label:              z.enum(['EXCELLENT', 'GOOD', 'UNCERTAIN', 'POOR']),
  reasoning:          z.string(),
  workEvident:        z.boolean(),
  suspiciousActivity: z.boolean(),
  recommendation:     z.enum(['APPROVE', 'REVIEW', 'REJECT']),
})

export type AiVerificationResult = z.infer<typeof AiResultSchema>

// ─── Main ─────────────────────────────────────────────────────────────────────

const AI_MODEL = 'gpt-4o-mini'

export async function verifyTaskSubmission(taskId: string): Promise<AiVerificationResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      media: true,
      referencePoints: true,
      workerSubmissions: true,
    },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  // ── Build image content: paired mode (new) or legacy mode ────────────────
  let imageMessages: Array<{ type: 'image_url'; image_url: { url: string } }>
  let prompt: string

  if (task.referencePoints.length > 0 && task.workerSubmissions.length > 0) {
    // New flow: per-point buyer/worker image pairs
    const pairs = task.referencePoints
      .map((refPoint) => {
        const afterSub = task.workerSubmissions.find(
          (s) => s.referencePointId === refPoint.id && (s.mediaType === 'AFTER' || s.mediaType === 'VERIFICATION'),
        )
        return { refPoint, afterSub }
      })
      .filter((p) => p.afterSub != null)

    // Two-phase: send verification pairs first (cost optimization)
    const verificationPairs = pairs.filter((p) => p.refPoint.isVerificationPoint)
    const pairsToSend = verificationPairs.length >= 2 ? verificationPairs : pairs.slice(0, 4)

    imageMessages = pairsToSend.flatMap((pair) => [
      { type: 'image_url' as const, image_url: { url: pair.refPoint.buyerImageUrl } },
      { type: 'image_url' as const, image_url: { url: pair.afterSub!.imageUrl } },
    ])

    prompt =
      `You are an AI verification system for civic cleanup work. ` +
      `Task: ${task.description}. Category: ${task.category}. Dirty level: ${task.dirtyLevel}. ` +
      `You are receiving ${pairsToSend.length} pairs of images. ` +
      `Each pair: first image is buyer's REFERENCE (dirty area), second is worker's AFTER (should be cleaned). ` +
      `For each pair, assess: (1) same location? (2) area cleaner? (3) work evident? ` +
      `Return ONLY valid JSON, no other text: ` +
      `{"score":0.85,"label":"GOOD","reasoning":"...","workEvident":true,` +
      `"suspiciousActivity":false,"recommendation":"APPROVE"}`
  } else {
    // Legacy flow: BEFORE + AFTER + PROOF
    const beforeMedia = task.media.find((m) => m.type === 'BEFORE')
    const afterMedia  = task.media.find((m) => m.type === 'AFTER')
    const proofMedia  = task.media.find((m) => m.type === 'PROOF')

    if (!beforeMedia || !afterMedia || !proofMedia) {
      throw new Error('Missing required BEFORE, AFTER, or PROOF media for AI verification')
    }

    imageMessages = [
      { type: 'image_url', image_url: { url: beforeMedia.url } },
      { type: 'image_url', image_url: { url: afterMedia.url  } },
      { type: 'image_url', image_url: { url: proofMedia.url  } },
    ]

    prompt =
      `You are an AI verification system for civic work. ` +
      `Task: ${task.description}. Category: ${task.category}. ` +
      `Dirty level: ${task.dirtyLevel}. ` +
      `Image 1=BEFORE, Image 2=AFTER, Image 3=PROOF. ` +
      `Return ONLY valid JSON with no other text: ` +
      `{"score":0.85,"label":"GOOD","reasoning":"...","workEvident":true,` +
      `"suspiciousActivity":false,"recommendation":"APPROVE"}`
  }

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageMessages,
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('Empty response from OpenAI')

  // Extract JSON from response (might have markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    logger.error({ taskId, raw: text }, 'Failed to extract JSON from AI response')
    throw new Error('OpenAI returned non-JSON response')
  }

  let result: AiVerificationResult
  try {
    result = AiResultSchema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    logger.error({ taskId, raw: text }, 'Failed to parse AI verification JSON')
    throw new Error('OpenAI returned invalid JSON')
  }

  // Persist score + reasoning + model version
  await prisma.task.update({
    where: { id: taskId },
    data: {
      aiScore:        result.score,
      aiReasoning:    result.reasoning,
      aiModelVersion: AI_MODEL,
    },
  })

  // If BOTH rule engine passed AND AI approves → upgrade to AUTO_PASS
  const task2 = await prisma.task.findUnique({ where: { id: taskId } })
  if (task2?.ruleEngineScore && task2.ruleEngineScore >= 85 && result.score >= 0.75 && result.recommendation === 'APPROVE') {
    await prisma.task.update({
      where: { id: taskId },
      data: { finalDecision: 'AUTO_PASS' },
    })
  }

  return result
}
