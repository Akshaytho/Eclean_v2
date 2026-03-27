// eClean — Payouts, Wallet & Razorpay Webhook routes

import crypto from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { env } from '../../config/env'

// ─── Schemas ─────────────────────────────────────────────────────────────────

const pageQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
type PageQuery = z.infer<typeof pageQuerySchema>

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function payoutsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/v1/worker/wallet ─────────────────────────────────────────────
  // pendingCents, processingCents, availableCents, totalEarnedCents (COMPLETED lifetime)
  fastify.get(
    '/worker/wallet',
    { preHandler: [authenticate, authorize(['WORKER'])] },
    async (request, reply) => {
      const workerId = request.user.id

      const [payouts, profile] = await Promise.all([
        prisma.payout.findMany({
          where:  { workerId },
          select: { status: true, workerAmountCents: true },
        }),
        prisma.workerProfile.findUnique({
          where:  { userId: workerId },
          select: { completedTasks: true },
        }),
      ])

      let pendingCents     = 0
      let processingCents  = 0
      let availableCents   = 0
      let totalEarnedCents = 0  // lifetime COMPLETED only

      for (const p of payouts) {
        if (p.status === 'PENDING') {
          pendingCents    += p.workerAmountCents
        } else if (p.status === 'PROCESSING') {
          processingCents += p.workerAmountCents
        } else if (p.status === 'COMPLETED') {
          availableCents   += p.workerAmountCents
          totalEarnedCents += p.workerAmountCents  // COMPLETED only
        }
      }

      return reply.send({
        pendingCents,
        processingCents,
        availableCents,
        totalEarnedCents,
        completedTasksCount: profile?.completedTasks ?? 0,
      })
    },
  )

  // ── GET /api/v1/worker/payouts?page=&limit= ───────────────────────────────
  // Paginated list — includes task title + buyer name, newest first
  fastify.get<{ Querystring: PageQuery }>(
    '/worker/payouts',
    { preHandler: [authenticate, authorize(['WORKER']), validate({ query: pageQuerySchema })] },
    async (request, reply) => {
      const workerId    = request.user.id
      const { page, limit } = request.query
      const skip        = (page - 1) * limit

      const [payouts, total] = await Promise.all([
        prisma.payout.findMany({
          where:   { workerId },
          orderBy: { createdAt: 'desc' },
          skip,
          take:    limit,
          include: {
            task:  { select: { title: true } },
            buyer: { select: { name: true } },
          },
        }),
        prisma.payout.count({ where: { workerId } }),
      ])

      const items = payouts.map((p) => ({
        id:               p.id,
        taskId:           p.taskId,
        taskTitle:        p.task.title,
        buyerName:        p.buyer.name,
        amountCents:      p.amountCents,
        workerAmountCents: p.workerAmountCents,
        platformFeeCents: p.platformFeeCents,
        status:           p.status,
        razorpayPayoutId: p.razorpayPayoutId,
        paidAt:           p.paidAt,
        createdAt:        p.createdAt,
      }))

      return reply.send({ payouts: items, total, page, limit })
    },
  )

  // ── GET /api/v1/buyer/wallet ──────────────────────────────────────────────
  // totalSpentCents, escrowCents (tasks ACCEPTED/IN_PROGRESS/SUBMITTED)
  fastify.get(
    '/buyer/wallet',
    { preHandler: [authenticate, authorize(['BUYER'])] },
    async (request, reply) => {
      const buyerId = request.user.id

      const [profile, escrowResult] = await Promise.all([
        prisma.buyerProfile.findUnique({
          where:  { userId: buyerId },
          select: { totalSpentCents: true },
        }),
        prisma.task.aggregate({
          where:  { buyerId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'] } },
          _sum:   { rateCents: true },
        }),
      ])

      return reply.send({
        totalSpentCents: profile?.totalSpentCents ?? 0,
        escrowCents:     escrowResult._sum.rateCents ?? 0,
      })
    },
  )

  // ── POST /api/v1/webhooks/razorpay — PUBLIC, no auth middleware ───────────
  // Signature failure → 400. Internal processing failure → 200 (Razorpay must not retry).
  fastify.post(
    '/webhooks/razorpay',
    async (request: FastifyRequest, reply) => {
      const body = request.body as Record<string, unknown>

      // Log every incoming webhook with full payload for debugging
      logger.info({ event: body?.event, payload: body }, 'Razorpay webhook received')

      // ── Signature verification ─────────────────────────────────────────
      const signature = request.headers['x-razorpay-signature'] as string | undefined

      if (env.RAZORPAY_WEBHOOK_SECRET) {
        if (!signature) {
          logger.warn('Razorpay webhook: missing X-Razorpay-Signature header')
          return reply.status(400).send({ error: 'Missing signature' })
        }

        const rawBody = JSON.stringify(body)
        const expected = crypto
          .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
          .update(rawBody)
          .digest('hex')

        let sigValid = false
        try {
          const sigBuf = Buffer.from(signature, 'hex')
          const expBuf = Buffer.from(expected,  'hex')
          sigValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
        } catch {
          sigValid = false
        }

        if (!sigValid) {
          logger.warn({ signature }, 'Razorpay webhook: invalid signature — rejecting')
          return reply.status(400).send({ error: 'Invalid signature' })
        }
      } else {
        logger.warn('Razorpay webhook: RAZORPAY_WEBHOOK_SECRET not set — skipping verification')
      }

      // ── Process event — errors here return 200 so Razorpay does not retry ──
      const event = body?.event as string | undefined

      try {
        if (event === 'payout.processed') {
          await handlePayoutProcessed(body)
        } else if (event === 'payout.failed') {
          await handlePayoutFailed(body)
        } else {
          logger.info({ event }, 'Razorpay webhook: unhandled event — ignoring')
        }
      } catch (err) {
        // Internal error: log but still return 200 — Razorpay must not retry
        logger.error({ event, err }, 'Razorpay webhook: internal processing error')
      }

      return reply.status(200).send({ received: true })
    },
  )
}

// ─── Webhook handlers ─────────────────────────────────────────────────────────

async function handlePayoutProcessed(body: Record<string, unknown>): Promise<void> {
  const razorpayPayoutId = extractPayoutId(body)
  if (!razorpayPayoutId) {
    logger.error({ body }, 'payout.processed: missing payout id in payload')
    return
  }

  const payout = await prisma.payout.findFirst({
    where:   { razorpayPayoutId },
    include: { task: { select: { title: true } } },
  })

  if (!payout) {
    logger.warn({ razorpayPayoutId }, 'payout.processed: payout not found in DB')
    return
  }

  await prisma.payout.update({
    where: { id: payout.id },
    data:  { status: 'COMPLETED', paidAt: new Date() },
  })

  await prisma.notification.create({
    data: {
      userId: payout.workerId,
      type:   'PAYMENT_RECEIVED',
      title:  'Payment Received!',
      body:   `₹${payout.workerAmountCents / 100} has been credited to your bank account for "${payout.task.title}".`,
      data:   { payoutId: payout.id, taskId: payout.taskId },
    },
  })

  logger.info({ payoutId: payout.id, razorpayPayoutId }, 'Payout marked COMPLETED via webhook')
}

async function handlePayoutFailed(body: Record<string, unknown>): Promise<void> {
  const razorpayPayoutId = extractPayoutId(body)
  if (!razorpayPayoutId) {
    logger.error({ body }, 'payout.failed: missing payout id in payload')
    return
  }

  const payout = await prisma.payout.findFirst({
    where:   { razorpayPayoutId },
    include: { task: { select: { title: true } } },
  })

  if (!payout) {
    logger.warn({ razorpayPayoutId }, 'payout.failed: payout not found in DB')
    return
  }

  await prisma.payout.update({
    where: { id: payout.id },
    data:  { status: 'FAILED' },
  })

  await prisma.notification.create({
    data: {
      userId: payout.workerId,
      type:   'PAYMENT_RECEIVED',
      title:  'Payment Failed',
      body:   `We could not process your payment of ₹${payout.workerAmountCents / 100} for "${payout.task.title}". Our team has been notified.`,
      data:   { payoutId: payout.id, taskId: payout.taskId },
    },
  })

  const admins = await prisma.user.findMany({
    where:  { role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type:   'WITHDRAWAL_PROCESSED' as const,
        title:  'Payout Failed',
        body:   `Razorpay payout ${razorpayPayoutId} FAILED for task "${payout.task.title}". Manual review required.`,
      })),
    })
  }

  logger.info({ payoutId: payout.id, razorpayPayoutId }, 'Payout marked FAILED via webhook')
}

function extractPayoutId(body: Record<string, unknown>): string | undefined {
  const entity = (
    ((body?.payload as Record<string, unknown>)?.payout as Record<string, unknown>)
      ?.entity as Record<string, unknown> | undefined
  )
  return entity?.id as string | undefined
}
