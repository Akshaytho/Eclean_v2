/**
 * Payment Auto-Release Job — Ensures workers always get paid on time.
 *
 * Runs every 15 minutes. Checks SUBMITTED tasks and auto-releases payment
 * if buyer hasn't responded within the timeout window:
 *
 *   AUTO_PASS:      Immediate release (buyer has 24h dispute window)
 *   WORKER_GRACE:   12h auto-release (worker was present, GPS proves it)
 *   MANUAL_REVIEW:  72h auto-release (buyer had plenty of time to review)
 *
 * WHY: Workers need payment predictability. "I'll get paid within X hours max"
 * is what keeps them on the platform. A buyer who forgets to open the app
 * should not be able to hold a worker's ₹200 hostage.
 */

import { Queue, Worker } from 'bullmq'
import { bullmqConnection as connection } from '../lib/bullmq'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { payoutQueue, PAYOUT_QUEUE } from './payout.job'
import { notifyUser } from '../lib/notify'

export const PAYMENT_RELEASE_QUEUE = 'payment-auto-release'

export const paymentReleaseQueue = new Queue(PAYMENT_RELEASE_QUEUE, { connection })

// ─── Timeout windows (in hours) ─────────────────────────────────────────────

const TIMEOUTS = {
  AUTO_PASS: 0,          // Immediate — release on decision, buyer gets 24h dispute
  WORKER_GRACE: 12,      // 12 hours — GPS proves worker was there
  MANUAL_REVIEW: 72,     // 72 hours — buyer had 3 days to review
} as const

// ─── Worker factory ─────────────────────────────────────────────────────────

export function createPaymentReleaseWorker(): Worker {
  const worker = new Worker(
    PAYMENT_RELEASE_QUEUE,
    async () => {
      logger.info('Payment auto-release check started')

      // Find SUBMITTED tasks that haven't been approved/rejected yet
      const submittedTasks = await prisma.task.findMany({
        where: {
          status: 'SUBMITTED',
          submittedAt: { not: null },
          finalDecision: { in: ['AUTO_PASS', 'WORKER_GRACE', 'MANUAL_REVIEW'] },
        },
        select: {
          id: true,
          title: true,
          buyerId: true,
          workerId: true,
          rateCents: true,
          submittedAt: true,
          finalDecision: true,
          aiScore: true,
        },
      })

      const now = Date.now()
      let released = 0
      let escalated = 0

      for (const task of submittedTasks) {
        if (!task.submittedAt || !task.finalDecision || !task.workerId) continue

        const hoursSinceSubmit = (now - task.submittedAt.getTime()) / 3600000
        const timeout = TIMEOUTS[task.finalDecision as keyof typeof TIMEOUTS]

        if (timeout === undefined) continue
        if (hoursSinceSubmit < timeout) continue

        // SECURITY: don't auto-release MANUAL_REVIEW tasks with low or fallback AI scores
        // aiScore === 0.5 is the fallback score when AI fails — never auto-release on fallback
        // These are likely fraudulent or unverified — escalate to admin/supervisor instead
        if (task.finalDecision === 'MANUAL_REVIEW' && (task.aiScore === null || task.aiScore <= 0.50)) {
          logger.warn(
            { taskId: task.id, aiScore: task.aiScore, hoursSinceSubmit: Math.round(hoursSinceSubmit) },
            'MANUAL_REVIEW task with low AI score — skipping auto-release, needs admin review',
          )
          await notifyUser({
            userId: task.buyerId,
            type: 'TASK_VERIFIED',
            title: 'Task Needs Review',
            body: `Task "${task.title}" has a low verification score and requires manual review. Please check and approve or reject.`,
            data: { taskId: task.id, needsManualReview: true },
          }).catch(() => {})
          escalated++
          continue
        }

        // Auto-approve the task — full approval logic (matches approveTask in tasks.service.ts)
        try {
          const platformFeeCents  = Math.floor(task.rateCents * 0.10)
          const workerAmountCents = task.rateCents - platformFeeCents

          const payout = await prisma.$transaction(async (tx) => {
            await tx.task.update({
              where: { id: task.id },
              data: { status: 'APPROVED', completedAt: new Date() },
            })

            const newPayout = await tx.payout.create({
              data: {
                taskId: task.id,
                workerId: task.workerId!,
                buyerId: task.buyerId,
                amountCents: task.rateCents,
                platformFeeCents,
                workerAmountCents,
                status: 'PENDING',
              },
            })

            await tx.workerProfile.update({
              where: { userId: task.workerId! },
              data: { activeTaskId: null, completedTasks: { increment: 1 } },
            })

            await tx.buyerProfile.update({
              where: { userId: task.buyerId },
              data: { totalSpentCents: { increment: task.rateCents } },
            }).catch(() => {}) // buyer profile may not exist for admin-created tasks

            return newPayout
          })

          // Enqueue payout job (after transaction commits)
          await payoutQueue.add(
            PAYOUT_QUEUE,
            { payoutId: payout.id },
            { jobId: `payout_${payout.id}` },
          )

          // Notify worker (DB + push + socket)
          await notifyUser({
            userId: task.workerId!,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment Released',
            body: `₹${workerAmountCents / 100} for "${task.title}" has been auto-released. Thank you for your work!`,
            data: { taskId: task.id, payoutId: payout.id, autoReleased: true },
          })

          // Notify buyer (DB + push + socket)
          await notifyUser({
            userId: task.buyerId,
            type: 'TASK_VERIFIED',
            title: 'Payment Auto-Released',
            body: `Payment for "${task.title}" was auto-released after ${timeout}h. You can dispute within 24h.`,
            data: { taskId: task.id, autoReleased: true, disputeWindowHours: 24 },
          })

          released++
          logger.info({ taskId: task.id, decision: task.finalDecision, hoursSinceSubmit: Math.round(hoursSinceSubmit) },
            'Payment auto-released')
        } catch (err) {
          logger.error({ taskId: task.id, err }, 'Failed to auto-release payment')
        }
      }

      logger.info({ checked: submittedTasks.length, released, escalated }, 'Payment auto-release check complete')

      // ── Dispute resolution timeout (7 days) ───────────────────────────────
      // SECURITY: disputes cannot lock funds indefinitely
      // After 7 days, auto-resolve based on AI score
      const DISPUTE_TIMEOUT_HOURS = 168 // 7 days
      const disputedTasks = await prisma.task.findMany({
        where: {
          status: 'DISPUTED',
          updatedAt: { lt: new Date(Date.now() - DISPUTE_TIMEOUT_HOURS * 3600000) },
        },
        select: {
          id: true, title: true, buyerId: true, workerId: true,
          rateCents: true, aiScore: true, ruleEngineScore: true,
        },
      })

      for (const dt of disputedTasks) {
        try {
          // Resolve in favor of the party with stronger evidence
          // AI score >= 0.50 OR rule engine score >= 50 → worker wins
          const workerWins = (dt.aiScore !== null && dt.aiScore >= 0.50) ||
                             (dt.ruleEngineScore !== null && dt.ruleEngineScore >= 50)

          if (workerWins && dt.workerId) {
            // Approve + pay worker
            const platformFeeCents  = Math.floor(dt.rateCents * 0.10)
            const workerAmountCents = dt.rateCents - platformFeeCents

            const payout = await prisma.$transaction(async (tx) => {
              await tx.task.update({
                where: { id: dt.id },
                data: { status: 'APPROVED', completedAt: new Date() },
              })
              return tx.payout.create({
                data: {
                  taskId: dt.id, workerId: dt.workerId!, buyerId: dt.buyerId,
                  amountCents: dt.rateCents, platformFeeCents, workerAmountCents, status: 'PENDING',
                },
              })
            })
            await payoutQueue.add(PAYOUT_QUEUE, { payoutId: payout.id }, { jobId: `payout_${payout.id}` })
            await notifyUser({ userId: dt.workerId, type: 'PAYMENT_RECEIVED', title: 'Dispute Resolved — You Won',
              body: `Dispute for "${dt.title}" was auto-resolved in your favor after 7 days.`, data: { taskId: dt.id } })
          } else {
            // Cancel + refund buyer
            await prisma.task.update({
              where: { id: dt.id },
              data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Dispute auto-resolved after 7 days — insufficient work evidence' },
            })
            await notifyUser({ userId: dt.buyerId, type: 'TASK_VERIFIED', title: 'Dispute Resolved — Refund Issued',
              body: `Dispute for "${dt.title}" was auto-resolved after 7 days. A refund will be processed.`, data: { taskId: dt.id } })
          }

          logger.info({ taskId: dt.id, workerWins, aiScore: dt.aiScore, ruleEngineScore: dt.ruleEngineScore },
            'Dispute auto-resolved after 7 days')
        } catch (err) {
          logger.error({ taskId: dt.id, err }, 'Failed to auto-resolve dispute')
        }
      }

      if (disputedTasks.length > 0) {
        logger.info({ disputesResolved: disputedTasks.length }, 'Dispute auto-resolution complete')
      }
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Payment release job failed')
  })

  return worker
}

// ─── Schedule repeatable job (call once on app start) ────────────────────────

export async function schedulePaymentReleaseJob() {
  await paymentReleaseQueue.add(
    'check-releases',
    {},
    {
      repeat: { every: 15 * 60 * 1000 }, // every 15 minutes
      jobId: 'payment-release-repeatable',
    },
  )
}
