// eClean — AI Verification Job (v2)
//
// BullMQ worker that processes AI verification for submitted tasks.
// Updated to use the full verification engine with multi-dimensional scoring,
// fraud detection, and worker trust integration.
//
// Notification logic:
//   APPROVE (score ≥ 0.70, no fraud flags) → notify buyer "AI Approved"
//   REVIEW  (score 0.45-0.70, or fraud flagged) → notify buyer "Manual Review Needed"
//   REJECT  (score < 0.45, or no work evident) → notify buyer "AI Rejected"
//
// Failures are NON-FATAL — if the engine fails, task enters manual review.
// Worker should never lose their submission because of an API hiccup.

import { Queue, Worker } from 'bullmq'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { bullmqConnection as connection } from '../lib/bullmq'
import { verifyTaskSubmission } from '../modules/ai/ai.service'
import { emitTaskUpdated } from '../realtime/socket'

// ─── Queue (used by controller to enqueue jobs) ───────────────────────────────

export const AI_VERIFY_QUEUE = 'ai-verification'

export const aiVerifyQueue = new Queue<{ taskId: string }>(AI_VERIFY_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createAiVerifyWorker(): Worker {
  const worker = new Worker<{ taskId: string }>(
    AI_VERIFY_QUEUE,
    async (job) => {
      const { taskId } = job.data
      logger.info({ taskId, jobId: job.id }, 'AI verification engine started')

      try {
        // Run the full verification engine
        const result = await verifyTaskSubmission(taskId)

        logger.info(
          {
            taskId,
            score: result.score,
            label: result.label,
            recommendation: result.recommendation,
            confidence: result.confidence,
            fraudFlagged: result.fraudReport.isFlagged,
            processingTimeMs: result.processingTimeMs,
          },
          'AI verification engine complete',
        )

        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task) return

        // ── Notification based on recommendation ────────────────────────
        if (result.recommendation === 'APPROVE') {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type: 'TASK_VERIFIED',
              title: 'AI Verification Passed',
              body: buildApproveNotification(task.title, result.score, result.label, result.confidence),
              data: {
                taskId,
                verificationId: result.verificationId,
                score: result.score,
                label: result.label,
                confidence: result.confidence,
                dimensions: result.dimensions,
              },
            },
          })

          // Also notify worker of positive result
          if (task.workerId) {
            await prisma.notification.create({
              data: {
                userId: task.workerId,
                type: 'TASK_VERIFIED',
                title: 'Great Work!',
                body: `Your submission for "${task.title}" scored ${Math.round(result.score * 100)}% (${result.label}). Waiting for buyer approval.`,
                data: { taskId, score: result.score, label: result.label },
              },
            })
          }
        } else if (result.recommendation === 'REVIEW') {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type: 'TASK_SUBMITTED',
              title: 'Manual Review Required',
              body: buildReviewNotification(task.title, result.score, result.fraudReport.isFlagged),
              data: {
                taskId,
                verificationId: result.verificationId,
                score: result.score,
                label: result.label,
                needsReview: true,
                fraudFlagged: result.fraudReport.isFlagged,
              },
            },
          })
        } else if (result.recommendation === 'REJECT') {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type: 'TASK_REJECTED',
              title: 'AI Verification Failed',
              body: buildRejectNotification(task.title, result.score, result.reasoning),
              data: {
                taskId,
                verificationId: result.verificationId,
                score: result.score,
                label: result.label,
                reasoning: result.reasoning,
                improvementSuggestions: result.scoringResult.scoreBreakdown,
              },
            },
          })

          // Notify worker of rejection with actionable feedback
          if (task.workerId) {
            await prisma.notification.create({
              data: {
                userId: task.workerId,
                type: 'TASK_REJECTED',
                title: 'Submission Needs Improvement',
                body: `Your submission for "${task.title}" scored ${Math.round(result.score * 100)}%. ${result.reasoning}`,
                data: { taskId, score: result.score, reasoning: result.reasoning },
              },
            })
          }
        }

        // Emit real-time update
        emitTaskUpdated(taskId, task.status)
      } catch (err) {
        // AI engine failure — do NOT fail the submission, flag for manual review
        logger.error({ taskId, jobId: job.id, err }, 'AI verification engine failed — flagging for manual review')

        // Clear AI score (so UI knows verification didn't complete)
        await prisma.task.update({
          where: { id: taskId },
          data: { aiScore: null, aiReasoning: null },
        }).catch(() => {})

        // Notify buyer that manual review is needed
        const task = await prisma.task.findUnique({ where: { id: taskId } }).catch(() => null)
        if (task) {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type: 'TASK_SUBMITTED',
              title: 'Manual Review Required',
              body: `AI verification is temporarily unavailable for "${task.title}". Please review the submission manually.`,
              data: { taskId, aiUnavailable: true },
            },
          }).catch(() => {})
        }
      }
    },
    {
      connection,
      concurrency: 2, // process up to 2 verifications in parallel
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'AI verification job permanently failed')
  })

  return worker
}

// ─── Notification Text Builders ─────────────────────────────────────────────

function buildApproveNotification(
  title: string, score: number, label: string, confidence: number,
): string {
  const scorePercent = Math.round(score * 100)
  if (label === 'EXCELLENT') {
    return `Excellent work on "${title}"! AI scored ${scorePercent}% with high confidence. Please review and approve to release payment.`
  }
  return `Work on "${title}" verified — AI scored ${scorePercent}% (${label}). Please review and approve to release payment.`
}

function buildReviewNotification(
  title: string, score: number, fraudFlagged: boolean,
): string {
  const scorePercent = Math.round(score * 100)
  if (fraudFlagged) {
    return `AI flagged potential issues with "${title}" (score: ${scorePercent}%). Please review the photos carefully before making a decision.`
  }
  return `"${title}" needs your review — AI scored ${scorePercent}%, which is in the borderline range. Your judgment will help improve future accuracy.`
}

function buildRejectNotification(
  title: string, score: number, reasoning: string,
): string {
  const scorePercent = Math.round(score * 100)
  const shortReason = reasoning.length > 100 ? reasoning.slice(0, 100) + '...' : reasoning
  return `AI verification for "${title}" scored ${scorePercent}%. Reason: ${shortReason}`
}
