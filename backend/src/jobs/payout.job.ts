// eClean — BullMQ payout job
// Queue name: process-payout   Data: { payoutId: string }
//
// test_mode  (RAZORPAY_KEY_ID === 'test_mode'): mark COMPLETED immediately — dev/CI
// production: call Razorpay Payout API, set PROCESSING; webhook confirms later

import { Queue, Worker } from 'bullmq'
import Razorpay from 'razorpay'
import { env } from '../config/env'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { bullmqConnection as connection } from '../lib/bullmq'

// ─── Queue (imported by services to enqueue jobs) ─────────────────────────────

export const PAYOUT_QUEUE = 'process-payout'

export const payoutQueue = new Queue<{ payoutId: string }>(PAYOUT_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50  },
  },
})

// ─── Razorpay singleton ───────────────────────────────────────────────────────

let _razorpay: Razorpay | null = null
function getRazorpay(): Razorpay | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return null
  if (env.RAZORPAY_KEY_ID === 'test_mode')               return null
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id:     env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    })
    logger.info('Razorpay client initialised')
  }
  return _razorpay
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createPayoutWorker(): Worker {
  const worker = new Worker<{ payoutId: string }>(
    PAYOUT_QUEUE,
    async (job) => {
      const { payoutId } = job.data
      logger.info({ payoutId, jobId: job.id }, 'Payout job started')

      // ── Fetch payout + worker info ─────────────────────────────────────────
      const payout = await prisma.payout.findUnique({
        where:   { id: payoutId },
        include: { worker: { select: { id: true, name: true, email: true } },
                   task:   { select: { title: true } } },
      })

      if (!payout) {
        logger.error({ payoutId }, 'Payout record not found — skipping')
        return
      }

      // Idempotency guard — safe to re-run if job retried
      if (payout.status !== 'PENDING') {
        logger.warn({ payoutId, status: payout.status }, 'Payout already processed — skipping')
        return
      }

      logger.info(
        { payoutId, workerId: payout.workerId, workerAmountCents: payout.workerAmountCents },
        'Processing payout',
      )

      // ── TEST MODE ─────────────────────────────────────────────────────────
      if (env.RAZORPAY_KEY_ID === 'test_mode') {
        logger.info({ payoutId }, '[test_mode] Marking payout COMPLETED immediately')

        await prisma.payout.update({
          where: { id: payoutId },
          data:  { status: 'COMPLETED', paidAt: new Date() },
        })

        await prisma.notification.create({
          data: {
            userId: payout.workerId,
            type:   'PAYMENT_RECEIVED',
            title:  'Payment Received!',
            body:   `₹${payout.workerAmountCents / 100} has been credited to your account for "${payout.task.title}".`,
            data:   { payoutId, taskId: payout.taskId },
          },
        })

        logger.info({ payoutId }, '[test_mode] Payout completed')
        return
      }

      // ── PRODUCTION — Razorpay Payout API ─────────────────────────────────
      const rzp = getRazorpay()
      if (!rzp) {
        // No Razorpay credentials configured outside test_mode — set FAILED
        logger.error({ payoutId }, 'Razorpay not configured — cannot process payout')
        await prisma.payout.update({
          where: { id: payoutId },
          data:  { status: 'FAILED' },
        })
        await notifyAdmins(
          `Payout ${payoutId} failed — Razorpay not configured. Task: ${payout.task.title}`,
        )
        return
      }

      try {
        logger.info(
          { payoutId, amountPaise: payout.workerAmountCents },
          'Calling Razorpay Payout API',
        )

        // Razorpay Payout API — requires RazorpayX + fund_account_id (bank account pre-registered)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rzpPayout = await (rzp as any).payouts.create({
          account_number: env.RAZORPAY_KEY_ID, // RazorpayX account (env var)
          amount:         payout.workerAmountCents,
          currency:       payout.currency,
          mode:           'IMPS',
          purpose:        'payout',
          queue_if_low_balance: true,
          reference_id:   payoutId,
          narration:      `eClean payment for ${payout.task.title}`,
        })

        logger.info(
          { payoutId, razorpayPayoutId: rzpPayout.id, status: rzpPayout.status },
          'Razorpay Payout API response',
        )

        await prisma.payout.update({
          where: { id: payoutId },
          data:  { status: 'PROCESSING', razorpayPayoutId: rzpPayout.id as string },
        })

        await prisma.notification.create({
          data: {
            userId: payout.workerId,
            type:   'PAYMENT_RECEIVED',
            title:  'Payout Initiated',
            body:   `₹${payout.workerAmountCents / 100} payout for "${payout.task.title}" has been initiated and is being processed.`,
            data:   { payoutId, taskId: payout.taskId },
          },
        })

        logger.info({ payoutId }, 'Payout set to PROCESSING — awaiting Razorpay webhook')
      } catch (err) {
        logger.error({ payoutId, err }, 'Razorpay Payout API call failed')

        await prisma.payout.update({
          where: { id: payoutId },
          data:  { status: 'FAILED' },
        })

        await prisma.notification.create({
          data: {
            userId: payout.workerId,
            type:   'PAYMENT_RECEIVED',
            title:  'Payout Failed',
            body:   `We could not process your payment for "${payout.task.title}". Our team has been notified.`,
            data:   { payoutId, taskId: payout.taskId },
          },
        })

        await notifyAdmins(`Payout ${payoutId} FAILED — Razorpay error: ${String(err)}`)
      }
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, payoutId: job?.data?.payoutId, err }, 'Payout BullMQ job permanently failed')
  })

  return worker
}

// ─── Helper — notify all admins ───────────────────────────────────────────────

async function notifyAdmins(body: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  if (admins.length === 0) return
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type:   'WITHDRAWAL_PROCESSED' as const,
      title:  'Payout Alert',
      body,
    })),
  })
}
