// eClean — Razorpay Payment Service
//
// Handles the BUYER side of payments:
//   1. Create Order  — buyer pays when posting a task (escrow capture)
//   2. Verify Payment — HMAC signature check before creating the task
//   3. Refund         — return money when task is cancelled
//
// The WORKER side (payout after approval) is handled by jobs/payout.job.ts
//
// Test mode: RAZORPAY_KEY_ID starting with "rzp_test_" uses Razorpay sandbox.
//            Test card: 4111 1111 1111 1111, any future expiry, any CVV.

import crypto from 'crypto'
import Razorpay from 'razorpay'
import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { BadRequestError } from '../../lib/errors'

// ─── Razorpay client singleton ──────────────────────────────────────────────

let _razorpay: Razorpay | null = null

function getRazorpay(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new BadRequestError('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.')
  }
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id:     env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    })
    logger.info('Razorpay payment client initialized')
  }
  return _razorpay
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateOrderResult {
  orderId:  string   // Razorpay order_id — pass to mobile checkout
  amount:   number   // amount in paise
  currency: string
  keyId:    string   // Razorpay key_id — mobile needs this for checkout
}

// ─── Create Order ───────────────────────────────────────────────────────────
// Called BEFORE task creation. Buyer must pay this order via Razorpay Checkout.
// The payment is auto-captured (no manual capture needed).

export async function createOrder(
  amountCents: number,
  buyerId:     string,
  taskTitle:   string,
): Promise<CreateOrderResult> {
  if (amountCents < 100) {
    throw new BadRequestError('Minimum payment is ₹1 (100 paise)')
  }

  const rzp = getRazorpay()

  const order = await rzp.orders.create({
    amount:   amountCents,          // Razorpay expects paise (same as our cents)
    currency: 'INR',
    receipt:  `task_${buyerId}_${Date.now()}`,
    notes: {
      buyerId,
      taskTitle,
      platform: 'eClean',
    },
  })

  logger.info(
    { orderId: order.id, amount: amountCents, buyerId },
    'Razorpay order created',
  )

  return {
    orderId:  order.id,
    amount:   amountCents,
    currency: 'INR',
    keyId:    env.RAZORPAY_KEY_ID!,
  }
}

// ─── Verify Payment Signature ───────────────────────────────────────────────
// After buyer pays, mobile sends (orderId, paymentId, signature).
// We verify the HMAC-SHA256 signature to confirm payment is genuine.
// See: https://razorpay.com/docs/payments/server-integration/nodejs/payment-verification/

export function verifyPaymentSignature(
  orderId:   string,
  paymentId: string,
  signature: string,
): boolean {
  if (!env.RAZORPAY_KEY_SECRET) {
    throw new BadRequestError('Razorpay secret not configured')
  }

  const body = `${orderId}|${paymentId}`
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex')

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected,  'hex')
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

// ─── Refund Payment ─────────────────────────────────────────────────────────
// Called when buyer cancels a task that has been paid.
// Full refund — partial refunds not supported in v1.

export async function refundPayment(
  paymentId:  string,
  amountCents: number,
): Promise<{ refundId: string }> {
  const rzp = getRazorpay()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refund = await (rzp.payments as any).refund(paymentId, {
      amount: amountCents,    // full refund in paise
      speed:  'normal',       // normal = 5-7 business days
      notes: {
        reason: 'Task cancelled by buyer',
        platform: 'eClean',
      },
    })

    logger.info(
      { refundId: refund.id, paymentId, amount: amountCents },
      'Razorpay refund created',
    )

    return { refundId: refund.id }
  } catch (err) {
    logger.error({ paymentId, amountCents, err }, 'Razorpay refund failed')
    throw new BadRequestError('Refund failed. Please contact support.')
  }
}
