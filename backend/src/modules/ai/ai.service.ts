import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'

if (!env.ANTHROPIC_API_KEY) {
  // Deferred — AI verification will return an error at call time, not at startup
}

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || 'not-configured' })

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
// Uses Cloudinary URLs directly — Anthropic fetches from CDN, zero server RAM used.

export async function verifyTaskSubmission(taskId: string): Promise<AiVerificationResult> {
  const task = await prisma.task.findUnique({
    where:   { id: taskId },
    include: { media: true },
  })
  if (!task) throw new Error(`Task ${taskId} not found`)

  const beforeMedia = task.media.find((m) => m.type === 'BEFORE')
  const afterMedia  = task.media.find((m) => m.type === 'AFTER')
  const proofMedia  = task.media.find((m) => m.type === 'PROOF')

  if (!beforeMedia || !afterMedia || !proofMedia) {
    throw new Error('Missing required BEFORE, AFTER, or PROOF media for AI verification')
  }

  const prompt =
    `You are an AI verification system for civic work. ` +
    `Task: ${task.description}. Category: ${task.category}. ` +
    `Dirty level: ${task.dirtyLevel}. ` +
    `Image 1=BEFORE, Image 2=AFTER, Image 3=PROOF. ` +
    `Return ONLY valid JSON with no other text. Example: ` +
    `{"score":0.85,"label":"GOOD","reasoning":"...","workEvident":true,` +
    `"suspiciousActivity":false,"recommendation":"APPROVE"}`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [
      {
        role:    'user',
        content: [
          { type: 'image', source: { type: 'url', url: beforeMedia.url } },
          { type: 'image', source: { type: 'url', url: afterMedia.url  } },
          { type: 'image', source: { type: 'url', url: proofMedia.url  } },
          { type: 'text',  text: prompt },
        ],
      },
    ],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic')

  let result: AiVerificationResult
  try {
    result = AiResultSchema.parse(JSON.parse(block.text))
  } catch {
    logger.error({ taskId, raw: block.text }, 'Failed to parse AI verification JSON')
    throw new Error('Anthropic returned non-JSON response')
  }

  // Persist score + reasoning to task
  await prisma.task.update({
    where: { id: taskId },
    data:  {
      aiScore:     result.score,
      aiReasoning: result.reasoning,
    },
  })

  return result
}
