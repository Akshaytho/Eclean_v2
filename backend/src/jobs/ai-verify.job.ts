import { Queue, Worker } from 'bullmq'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { bullmqConnection as connection } from '../lib/bullmq'
import { verifyTaskSubmission } from '../modules/ai/ai.service'

// ─── Queue (used by controller to enqueue jobs) ───────────────────────────────

export const AI_VERIFY_QUEUE = 'ai-verification'

export const aiVerifyQueue = new Queue<{ taskId: string }>(AI_VERIFY_QUEUE, { connection })

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createAiVerifyWorker(): Worker {
  const worker = new Worker<{ taskId: string }>(
    AI_VERIFY_QUEUE,
    async (job) => {
      const { taskId } = job.data
      logger.info({ taskId, jobId: job.id }, 'AI verification started')

      try {
        const result = await verifyTaskSubmission(taskId)
        logger.info({ taskId, score: result.score, label: result.label }, 'AI verification complete')

        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task) return

        if (result.score >= 0.75 && result.recommendation === 'APPROVE') {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type:   'TASK_VERIFIED',
              title:  'AI Verification Passed ✓',
              body:   `Work for "${task.title}" scored ${Math.round(result.score * 100)}% — please review and approve.`,
              data:   { taskId, score: result.score, label: result.label },
            },
          })
        } else if (result.score < 0.50 || result.recommendation === 'REJECT') {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type:   'TASK_REJECTED',
              title:  'AI Verification Failed ✗',
              body:   `Work for "${task.title}" scored ${Math.round(result.score * 100)}%. Reason: ${result.reasoning}`,
              data:   { taskId, score: result.score, label: result.label, reasoning: result.reasoning },
            },
          })
        }
        // 0.50–0.74 or REVIEW: no auto-notification, enters manual review queue
      } catch (err) {
        // Anthropic / network failure — do NOT fail the submission
        logger.error({ taskId, jobId: job.id, err }, 'AI verification failed — flagging for manual review')

        await prisma.task.update({
          where: { id: taskId },
          data:  { aiScore: null, aiReasoning: null },
        }).catch(() => {
          // Ignore DB error here — task update is best-effort
        })

        const task = await prisma.task.findUnique({ where: { id: taskId } }).catch(() => null)
        if (task) {
          await prisma.notification.create({
            data: {
              userId: task.buyerId,
              type:   'TASK_SUBMITTED',
              title:  'Manual Review Required',
              body:   `AI verification unavailable for "${task.title}". Please review manually.`,
              data:   { taskId },
            },
          }).catch(() => {
            // Ignore notification failure
          })
        }
      }
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'BullMQ job permanently failed')
  })

  return worker
}
