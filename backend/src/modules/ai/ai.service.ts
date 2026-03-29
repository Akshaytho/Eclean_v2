// eClean — AI Verification Engine v2
//
// The orchestrator that ties together all verification components:
// 1. Image quality pre-screening
// 2. Category-specific Claude Vision analysis
// 3. Multi-dimensional scoring engine
// 4. Fraud detection
// 5. Worker trust integration
// 6. Structured result storage
//
// This replaces the old single-prompt, single-score system with a
// production-grade verification pipeline.
//
// BACKWARD COMPATIBLE: Still writes aiScore/aiReasoning to Task model
// so existing mobile/admin code continues to work. New data goes to
// AiVerification model for the full picture.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { TaskCategory, DirtyLevel } from '@prisma/client'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { buildVerificationPrompt, PROMPT_VERSION } from './prompts'
import { assessPhotoSet, type PhotoMetadata, type PhotoSetQualityReport } from './image-quality'
import { analyzeFraud, type FraudReport } from './fraud-engine'
import { getWorkerContext, updateTrustAfterVerification } from './worker-trust'
import { computeScore, type AiRawResponse, type ScoringResult } from './scoring-engine'

if (!env.ANTHROPIC_API_KEY) {
  // Deferred — AI verification will return an error at call time, not at startup
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-5'
const ENGINE_VERSION = 'eclean-verify-v2.1'

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || 'not-configured' })

// ─── Response Schema ────────────────────────────────────────────────────────

const AiRawResponseSchema = z.object({
  cleanlinessScore:       z.number().min(0).max(1),
  workEvidenceScore:      z.number().min(0).max(1),
  completenessScore:      z.number().min(0).max(1),
  safetyScore:            z.number().min(0).max(1),
  photoQualityScore:      z.number().min(0).max(1),
  workEvident:            z.boolean(),
  suspiciousActivity:     z.boolean(),
  locationConsistent:     z.boolean(),
  reasoning:              z.string(),
  categoryNotes:          z.string().nullable().optional(),
  improvementSuggestions: z.string().nullable().optional(),
})

// ─── Backward-compatible result type ────────────────────────────────────────
// Old code expects this shape. New code should use FullVerificationResult.

export interface AiVerificationResult {
  score: number
  label: string
  reasoning: string
  workEvident: boolean
  suspiciousActivity: boolean
  recommendation: string
}

// ─── Full verification result (new) ─────────────────────────────────────────

export interface FullVerificationResult {
  // Backward compat
  score: number
  label: string
  reasoning: string
  workEvident: boolean
  suspiciousActivity: boolean
  recommendation: string

  // New: full engine output
  verificationId: string
  dimensions: {
    cleanlinessScore: number
    workEvidenceScore: number
    completenessScore: number
    safetyScore: number
    photoQualityScore: number
  }
  confidence: number
  fraudReport: FraudReport
  photoQualityReport: PhotoSetQualityReport
  workerTrustContext: Awaited<ReturnType<typeof getWorkerContext>>
  scoringResult: ScoringResult
  processingTimeMs: number
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function verifyTaskSubmission(taskId: string): Promise<FullVerificationResult> {
  const startTime = Date.now()

  // ── Step 0: Load task + media + EXIF data ─────────────────────────────
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

  // Load EXIF data for fraud detection
  const [beforeExif, afterExif, proofExif] = await Promise.all([
    prisma.analyticsPhotoMeta.findUnique({ where: { mediaId: beforeMedia.id } }),
    prisma.analyticsPhotoMeta.findUnique({ where: { mediaId: afterMedia.id } }),
    prisma.analyticsPhotoMeta.findUnique({ where: { mediaId: proofMedia.id } }),
  ])

  // Build PhotoMetadata objects
  const buildPhotoMeta = (media: typeof beforeMedia, exif: typeof beforeExif): PhotoMetadata => ({
    url: media.url,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    mediaType: media.type,
    exifLat: exif?.exifLat ?? null,
    exifLng: exif?.exifLng ?? null,
    exifTimestamp: exif?.exifTimestamp ?? null,
    deviceMake: exif?.deviceMake ?? null,
    deviceModel: exif?.deviceModel ?? null,
    imageWidth: exif?.imageWidth ?? null,
    imageHeight: exif?.imageHeight ?? null,
    distanceFromTaskMeters: exif?.distanceFromTaskMeters ?? null,
    isFlagged: exif?.isFlagged ?? false,
    flagReason: exif?.flagReason ?? null,
  })

  const beforePhoto = buildPhotoMeta(beforeMedia, beforeExif)
  const afterPhoto  = buildPhotoMeta(afterMedia, afterExif)
  const proofPhoto  = buildPhotoMeta(proofMedia, proofExif)

  // ── Step 1: Image quality pre-screening ───────────────────────────────
  const photoReport = assessPhotoSet(
    beforePhoto, afterPhoto, proofPhoto,
    task.startedAt, task.submittedAt,
  )

  logger.info(
    { taskId, photoQuality: photoReport.overall, passesMinimum: photoReport.passesMinimum },
    'Step 1/6: Photo quality assessed',
  )

  // ── Step 2: Worker trust context ──────────────────────────────────────
  const workerContext = task.workerId
    ? await getWorkerContext(task.workerId)
    : { trustScore: 0.35, trustTier: 'NEW', totalVerifications: 0, avgAiScore: null,
        approvalRate: null, disputeRate: null, fraudFlagCount: 0, recentFraudFlags: 0,
        currentStreak: 0, longestStreak: 0, bestCategory: null, worstCategory: null,
        categoryScores: null, consistencyScore: null }

  logger.info(
    { taskId, trustTier: workerContext.trustTier, trustScore: workerContext.trustScore },
    'Step 2/6: Worker trust loaded',
  )

  // ── Step 3: Determine attempt number ──────────────────────────────────
  const previousVerifications = await prisma.aiVerification.count({
    where: { taskId },
  })
  const attemptNumber = previousVerifications + 1

  // Get previous rejection reasoning if re-submission
  let previousReasoning: string | undefined
  if (attemptNumber > 1) {
    const prev = await prisma.aiVerification.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: { reasoning: true },
    })
    previousReasoning = prev?.reasoning ?? undefined
  }

  // ── Step 4: Build prompt + call Claude Vision ─────────────────────────
  // Collect fraud signals from photo quality for the prompt
  const preComputedFraudSignals = [
    ...photoReport.before.fraudSignals,
    ...photoReport.after.fraudSignals,
    ...photoReport.proof.fraudSignals,
    ...photoReport.crossPhotoSignals,
  ]

  const prompt = buildVerificationPrompt({
    taskDescription: task.description,
    category: task.category,
    dirtyLevel: task.dirtyLevel,
    workerTrustTier: workerContext.trustTier,
    fraudSignals: preComputedFraudSignals.length > 0 ? preComputedFraudSignals : undefined,
    attemptNumber,
    previousReasoning,
  })

  const apiStartTime = Date.now()
  const response = await anthropic.messages.create({
    model:      ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: beforeMedia.url } },
          { type: 'image', source: { type: 'url', url: afterMedia.url  } },
          { type: 'image', source: { type: 'url', url: proofMedia.url  } },
          { type: 'text',  text: prompt },
        ],
      },
    ],
  })
  const apiTimeMs = Date.now() - apiStartTime

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic')

  let aiRaw: AiRawResponse
  try {
    // Parse the JSON — handle potential markdown code block wrapping
    let jsonText = block.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }
    aiRaw = AiRawResponseSchema.parse(JSON.parse(jsonText))
  } catch (parseErr) {
    logger.error({ taskId, raw: block.text }, 'Failed to parse AI verification JSON')
    throw new Error('Anthropic returned non-JSON response')
  }

  // Token usage
  const tokenUsage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cacheTokens: (response.usage as Record<string, number>)?.cache_creation_input_tokens ?? 0,
  }

  logger.info(
    { taskId, apiTimeMs, tokens: tokenUsage },
    'Step 4/6: Claude Vision analysis complete',
  )

  // ── Step 5: Fraud detection ───────────────────────────────────────────
  const fraudReport = await analyzeFraud({
    workerId: task.workerId ?? '',
    taskCategory: task.category,
    taskLat: task.locationLat,
    taskLng: task.locationLng,
    photoReport,
    aiDetectedSuspicious: aiRaw.suspiciousActivity,
  })

  logger.info(
    { taskId, fraudScore: fraudReport.fraudScore, isFlagged: fraudReport.isFlagged, signals: fraudReport.signals.length },
    'Step 5/6: Fraud analysis complete',
  )

  // ── Step 6: Multi-dimensional scoring ─────────────────────────────────
  const scoringResult = computeScore(aiRaw, {
    category: task.category,
    dirtyLevel: task.dirtyLevel,
    workerTrustScore: workerContext.trustScore,
    workerTrustTier: workerContext.trustTier,
    fraudReport,
    photoSetQualityScore: photoReport.overall,
    attemptNumber,
  })

  const processingTimeMs = Date.now() - startTime

  logger.info(
    {
      taskId,
      finalScore: scoringResult.finalScore,
      recommendation: scoringResult.recommendation,
      confidence: scoringResult.confidence,
      label: scoringResult.label,
      processingTimeMs,
    },
    'Step 6/6: Final scoring complete',
  )

  // ── Persist results ───────────────────────────────────────────────────

  // Write full verification record
  const verification = await prisma.aiVerification.create({
    data: {
      taskId,
      attemptNumber,
      finalScore: scoringResult.finalScore,
      recommendation: scoringResult.recommendation,
      confidence: scoringResult.confidence,
      label: scoringResult.label,
      cleanlinessScore: aiRaw.cleanlinessScore,
      workEvidenceScore: aiRaw.workEvidenceScore,
      photoQualityScore: aiRaw.photoQualityScore,
      completenessScore: aiRaw.completenessScore,
      safetyScore: aiRaw.safetyScore,
      categoryAnalysis: aiRaw.categoryNotes ? { notes: aiRaw.categoryNotes } : undefined,
      fraudScore: fraudReport.fraudScore,
      fraudSignals: fraudReport.signals.length > 0 ? fraudReport.signals : undefined,
      isFraudFlagged: fraudReport.isFlagged,
      workerTrustScore: workerContext.trustScore,
      workerHistoryContext: workerContext,
      reasoning: aiRaw.reasoning,
      detailedAnalysis: scoringResult.scoreBreakdown,
      improvementSuggestions: aiRaw.improvementSuggestions ?? null,
      modelVersion: ENGINE_VERSION,
      promptVersion: PROMPT_VERSION,
      anthropicModel: ANTHROPIC_MODEL,
      processingTimeMs,
      tokenUsage,
    },
  })

  // Backward compat: update Task.aiScore + Task.aiReasoning
  await prisma.task.update({
    where: { id: taskId },
    data: {
      aiScore: scoringResult.finalScore,
      aiReasoning: aiRaw.reasoning,
    },
  })

  // Update worker trust score (fire-and-forget)
  if (task.workerId) {
    void updateTrustAfterVerification({
      workerId: task.workerId,
      aiScore: scoringResult.finalScore,
      recommendation: scoringResult.recommendation,
      fraudScore: fraudReport.fraudScore,
      fraudFlagged: fraudReport.isFlagged,
      category: task.category,
    })
  }

  return {
    // Backward compat fields
    score: scoringResult.finalScore,
    label: scoringResult.label,
    reasoning: aiRaw.reasoning,
    workEvident: aiRaw.workEvident,
    suspiciousActivity: aiRaw.suspiciousActivity,
    recommendation: scoringResult.recommendation,

    // Full engine output
    verificationId: verification.id,
    dimensions: {
      cleanlinessScore: aiRaw.cleanlinessScore,
      workEvidenceScore: aiRaw.workEvidenceScore,
      completenessScore: aiRaw.completenessScore,
      safetyScore: aiRaw.safetyScore,
      photoQualityScore: aiRaw.photoQualityScore,
    },
    confidence: scoringResult.confidence,
    fraudReport,
    photoQualityReport: photoReport,
    workerTrustContext: workerContext,
    scoringResult,
    processingTimeMs,
  }
}
