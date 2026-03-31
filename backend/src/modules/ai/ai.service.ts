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

  // COST OPTIMIZATION: Skip AI for obvious rule engine decisions
  // Rule engine already checked GPS, coverage, time, duplicates — no need to pay for AI
  const existingTask = await prisma.task.findUnique({ where: { id: taskId }, select: { ruleEngineScore: true } })
  if (existingTask?.ruleEngineScore != null) {
    if (existingTask.ruleEngineScore >= 95) {
      // Perfect metadata score — AI would just confirm. Skip and save $0.06
      const autoResult: AiVerificationResult = {
        score: 0.95, label: 'EXCELLENT', reasoning: 'Skipped — rule engine score 95+, all metadata checks passed',
        workEvident: true, suspiciousActivity: false, recommendation: 'APPROVE',
      }
      await prisma.task.update({ where: { id: taskId }, data: { aiScore: autoResult.score, aiReasoning: autoResult.reasoning, aiModelVersion: 'rule-engine-bypass' } })
      return autoResult
    }
    if (existingTask.ruleEngineScore < 40) {
      // Terrible metadata — AI would just confirm rejection. Skip.
      const autoResult: AiVerificationResult = {
        score: 0.15, label: 'POOR', reasoning: 'Skipped — rule engine score below 40, multiple fraud indicators',
        workEvident: false, suspiciousActivity: true, recommendation: 'REJECT',
      }
      await prisma.task.update({ where: { id: taskId }, data: { aiScore: autoResult.score, aiReasoning: autoResult.reasoning, aiModelVersion: 'rule-engine-bypass' } })
      return autoResult
    }
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
  let imageMessages: Array<{ type: 'image_url'; image_url: { url: string; detail?: string } }>
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

    // Cost optimization: send only 1 verification pair (2 images = 170 tokens)
    // If AI flags concern, full analysis can be triggered manually
    const verificationPairs = pairs.filter((p) => p.refPoint.isVerificationPoint)
    const pairsToSend = verificationPairs.length >= 1 ? [verificationPairs[0]] : pairs.slice(0, 1)

    // detail: "low" = 512x512 fixed at 85 tokens per image (vs 85,000+ at high)
    // Cleaning evidence (trash removal, sweeping) is visible at low resolution
    // This reduces image cost by ~99%
    imageMessages = pairsToSend.flatMap((pair) => [
      { type: 'image_url' as const, image_url: { url: pair.refPoint.buyerImageUrl, detail: 'low' as const } },
      { type: 'image_url' as const, image_url: { url: pair.afterSub!.imageUrl, detail: 'low' as const } },
    ])

    prompt =
      `You are a STRICT AI verification system for civic cleanup work. ` +
      `Task title: "${task.title}". Description: "${task.description}". Category: ${task.category}. Dirty level: ${task.dirtyLevel}. ` +
      `You are receiving ${pairsToSend.length} pairs of images. ` +
      `Each pair: first image is buyer's REFERENCE (dirty area), second is worker's AFTER (should be cleaned). ` +
      `You MUST check ALL of the following: ` +
      `(1) Do the photos match the task description? If task says "bathroom cleaning" but photos show a laptop, score 0. ` +
      `(2) Are the before and after photos of the SAME location? ` +
      `(3) Is the area VISIBLY cleaner in the after photo? Look for actual cleaning evidence. ` +
      `(4) Are the before and after photos DIFFERENT images? If they look identical, the worker likely didn't do any work — score 0 and set suspiciousActivity to true. ` +
      `(5) Is there evidence of actual cleaning work (mop marks, wet surfaces, organized debris, removed trash)? ` +
      `Be STRICT. Do not give high scores for photos that don't match the task or show no real cleaning. ` +
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
      { type: 'image_url', image_url: { url: beforeMedia.url, detail: 'low' as const } },
      { type: 'image_url', image_url: { url: afterMedia.url, detail: 'low' as const } },
      { type: 'image_url', image_url: { url: proofMedia.url, detail: 'low' as const } },
    ]

    prompt =
      `You are a STRICT AI verification system for civic work. ` +
      `Task title: "${task.title}". Description: "${task.description}". Category: ${task.category}. Dirty level: ${task.dirtyLevel}. ` +
      `Image 1=BEFORE, Image 2=AFTER, Image 3=PROOF. ` +
      `Check: (1) Photos match task description? (2) Before/After are DIFFERENT images showing same location? (3) Area visibly cleaner? (4) Actual cleaning evidence? ` +
      `If photos don't match the task or show no cleaning, score 0. Be strict. ` +
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
          ...imageMessages as any,
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
