/**
 * OpenAI Verification Provider — gpt-4o-mini
 *
 * Single merged call: verification + fraud in one JSON response
 * Images at 768px via Cloudinary transformation (detail: "auto")
 * Fallback: parse failure → null (caller handles MANUAL_REVIEW)
 */

import OpenAI from 'openai'
import { env } from '../../config/env'
import type {
  AIVerificationProvider,
  VerificationImage,
  VerificationMetadata,
  VerificationResult,
} from './verification.interface'

const MODEL = 'gpt-4o-mini'

export class OpenAIProvider implements AIVerificationProvider {
  name = 'openai-gpt4o-mini'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY || 'not-configured' })
  }

  async verify(images: VerificationImage[], metadata: VerificationMetadata): Promise<VerificationResult> {
    // Resize images to 768px via Cloudinary URL transformation for cost efficiency
    // 768px → 2x2 tiles → 765 tokens/image (vs 85K at full res)
    const imageContent = images.map((img) => ({
      type: 'image_url' as const,
      image_url: {
        url: img.url.includes('/upload/')
          ? img.url.replace('/upload/', '/upload/w_768,h_768,c_limit/')
          : img.url,
        detail: 'auto' as const,
      },
    }))

    const prompt = this.buildPrompt(images, metadata)

    const response = await this.client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          ...imageContent as any,
          { type: 'text', text: prompt },
        ],
      }],
    })

    const text = response.choices[0]?.message?.content
    if (!text) throw new Error('Empty response from OpenAI')

    return this.parseResponse(text)
  }

  private buildPrompt(images: VerificationImage[], metadata: VerificationMetadata): string {
    const imageDesc = images.map((img) =>
      `${img.role === 'reference' ? 'BUYER REFERENCE' : 'WORKER AFTER'} (Point ${img.pointIndex}${img.label ? `: ${img.label}` : ''}, GPS match: ${img.gpsScore ?? 'unknown'}/100)`,
    ).join('\n')

    return `You are a STRICT verification system for eClean, a civic cleanup platform.

TASK: "${metadata.taskTitle}"
Description: "${metadata.taskDescription}"
Category: ${metadata.taskCategory} | Dirty level: ${metadata.dirtyLevel}

METADATA CONTEXT:
- Time on site: ${metadata.timeSpentSecs ? Math.round(metadata.timeSpentSecs / 60) : 'unknown'} minutes
- Reference points: ${metadata.totalReferencePoints} | Submissions: ${metadata.totalSubmissions}
- GPS scores: [${metadata.gpsScores.join(', ')}]
${metadata.motionData ? `- Motion: ${Math.round(metadata.motionData.cleaningPct * 100)}% cleaning, ${Math.round(metadata.motionData.standingPct * 100)}% standing, ${Math.round(metadata.motionData.vehiclePct * 100)}% vehicle` : '- Motion: no data'}
${metadata.envMatchScores.length > 0 ? `- Environmental match scores: [${metadata.envMatchScores.join(', ')}]` : '- Environmental: no data'}
${metadata.zoneDirtyScore != null ? `- Zone dirty score: ${metadata.zoneDirtyScore}/100` : '- Zone: no data'}

IMAGES:
${imageDesc}

VERIFICATION CHECKS (assess each):
1. Do photos match the task description and category "${metadata.taskCategory}"?
2. Are before and after taken from approximately the same angle and distance?
3. Is the area VISIBLY cleaner in the after photo?
4. Are before and after DIFFERENT images (not identical/screenshot)?
5. Evidence of actual cleaning work (mop marks, wet surfaces, removed trash)?
6. Any text, watermark, screenshot artifact, or UI overlay visible?
7. Indoor/outdoor consistency with task category?

FRAUD CHECKS (assess from metadata):
1. Any GPS scores suspiciously low (<25) or suspiciously identical?
2. Time reasonable for ${metadata.totalReferencePoints} reference points?
3. Motion data consistent with cleaning work?
4. Any statistical anomalies?

Return ONLY valid JSON, no markdown, no explanation outside JSON:
{"verification":{"score":0.85,"label":"GOOD","reasoning":"...","workEvident":true,"suspiciousActivity":false,"recommendation":"APPROVE"},"fraud":{"probability":0.1,"anomalies":[],"recommendation":"PASS"}}`
  }

  private parseResponse(text: string): VerificationResult {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    const parsed = JSON.parse(jsonMatch[0])

    // Validate both sections exist
    if (!parsed.verification || !parsed.fraud) {
      throw new Error('Response missing verification or fraud section')
    }

    return {
      verification: {
        score: Number(parsed.verification.score) || 0,
        label: String(parsed.verification.label || 'UNCERTAIN'),
        reasoning: String(parsed.verification.reasoning || ''),
        workEvident: Boolean(parsed.verification.workEvident),
        suspiciousActivity: Boolean(parsed.verification.suspiciousActivity),
        recommendation: String(parsed.verification.recommendation || 'REVIEW'),
      },
      fraud: {
        probability: Number(parsed.fraud.probability) || 0,
        anomalies: Array.isArray(parsed.fraud.anomalies) ? parsed.fraud.anomalies : [],
        recommendation: String(parsed.fraud.recommendation || 'PASS'),
      },
    }
  }
}
