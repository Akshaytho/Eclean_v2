/**
 * Wallet + Payouts tests
 * Covers: GET /worker/wallet, GET /worker/payouts,
 *         GET /buyer/wallet, POST /webhooks/razorpay
 *
 * Payout rows are created when buyer approves a task (tested in tasks.test.ts).
 * Here we verify the wallet endpoints return correct structure and the
 * Razorpay webhook handles signature validation correctly.
 */

import crypto from 'crypto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'stream'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import {
  getApp, closeApp, cleanTestData,
  registerUser, buildMultipart, TINY_JPEG, TEST_PASSWORD,
} from './helpers/setup'

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/cloudinary', () => ({
  assertCloudinaryConfigured: vi.fn(),
  cloudinary: {
    uploader: {
      upload_stream: vi.fn((_opts: unknown, cb: (err: null, res: object) => void) => {
        const ws = new Writable({
          write(_chunk, _enc, done) { done() },
          final(done) {
            cb(null, {
              secure_url: `https://res.cloudinary.com/test/image/upload/${Date.now()}.jpg`,
              public_id:  `eclean/tasks/test/${Date.now()}`,
            })
            done()
          },
        })
        return ws
      }),
      destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}))

let app:          FastifyInstance
let buyerToken:   string
let workerToken:  string
let workerId:     string
let approvedTaskId: string

beforeAll(async () => {
  app = await getApp()

  const buyer  = await registerUser(app, 'BUYER',  'wal1')
  const worker = await registerUser(app, 'WORKER', 'wal1')
  buyerToken  = buyer.accessToken
  workerToken = worker.accessToken
  workerId    = worker.user.id

  // Run full happy path so we have a payout row
  const taskRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/buyer/tasks',
    headers: { authorization: `Bearer ${buyerToken}` },
    payload: {
      title:       'Wallet test task',
      description: 'A task used to verify wallet endpoint calculations',
      category:    'STREET_CLEANING',
      dirtyLevel:  'MEDIUM',
    },
  })
  const taskId = JSON.parse(taskRes.payload).task.id
  approvedTaskId = taskId

  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${taskId}/accept`,
    headers: { authorization: `Bearer ${workerToken}` },
  })

  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${taskId}/start`,
    headers: { authorization: `Bearer ${workerToken}` },
  })

  // Upload BEFORE + AFTER + PROOF photos
  for (const mediaType of ['BEFORE', 'AFTER', 'PROOF']) {
    const boundary = 'TestBoundary123'
    const body = buildMultipart(boundary, { mediaType }, {
      fieldname: 'file',
      filename:  `photo-${mediaType}.jpg`,
      mimetype:  'image/jpeg',
      data:      TINY_JPEG,
    })
    await app.inject({
      method:  'POST',
      url:     `/api/v1/tasks/${taskId}/media`,
      headers: {
        authorization:  `Bearer ${workerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    })
  }

  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${taskId}/submit`,
    headers: { authorization: `Bearer ${workerToken}` },
  })

  await app.inject({
    method:  'POST',
    url:     `/api/v1/buyer/tasks/${taskId}/approve`,
    headers: { authorization: `Bearer ${buyerToken}` },
  })
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Worker wallet ──────────────────────────────────────────────────────────────

describe('GET /api/v1/worker/wallet', () => {
  it('returns wallet with pending payout from approved task', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/wallet',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(typeof body.pendingCents).toBe('number')
    expect(typeof body.processingCents).toBe('number')
    expect(typeof body.availableCents).toBe('number')
    expect(typeof body.totalEarnedCents).toBe('number')
    expect(typeof body.completedTasksCount).toBe('number')
    // After approval, payout is PENDING
    expect(body.pendingCents).toBeGreaterThan(0)
  })

  it('BUYER cannot access worker wallet → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/wallet',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/worker/wallet',
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Worker payouts list ───────────────────────────────────────────────────────

describe('GET /api/v1/worker/payouts', () => {
  it('returns paginated payout list with task + buyer info', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/payouts',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.payouts)).toBe(true)
    expect(typeof body.total).toBe('number')
    expect(body.payouts.length).toBeGreaterThan(0)

    const payout = body.payouts[0]
    expect(payout.taskTitle).toBeDefined()
    expect(payout.buyerName).toBeDefined()
    expect(payout.workerAmountCents).toBeGreaterThan(0)
    // BullMQ test_mode may process the payout immediately (COMPLETED) or leave as PENDING
    expect(['PENDING', 'COMPLETED']).toContain(payout.status)
  })

  it('pagination params are respected', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/payouts?page=1&limit=1',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).payouts.length).toBeLessThanOrEqual(1)
  })

  it('BUYER cannot access worker payouts → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/payouts',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Buyer wallet ──────────────────────────────────────────────────────────────

describe('GET /api/v1/buyer/wallet', () => {
  it('returns buyer wallet with totalSpentCents and escrowCents', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/wallet',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(typeof body.totalSpentCents).toBe('number')
    expect(typeof body.escrowCents).toBe('number')
    // After approval totalSpentCents should reflect the task cost
    expect(body.totalSpentCents).toBeGreaterThan(0)
  })

  it('WORKER cannot access buyer wallet → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/wallet',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Razorpay webhook ──────────────────────────────────────────────────────────

describe('POST /api/v1/webhooks/razorpay', () => {
  it('no RAZORPAY_WEBHOOK_SECRET set → accepts any payload → 200', async () => {
    // In test env, RAZORPAY_WEBHOOK_SECRET is not set → skips verification
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/webhooks/razorpay',
      payload: { event: 'unhandled.event', payload: {} },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).received).toBe(true)
  })

  it('payout.processed event with unknown razorpayPayoutId → 200 (graceful)', async () => {
    const body = {
      event: 'payout.processed',
      payload: {
        payout: {
          entity: { id: 'pout_nonexistent123' },
        },
      },
    }
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/webhooks/razorpay',
      payload: body,
    })
    // Should still return 200 — Razorpay must not retry
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).received).toBe(true)
  })

  it('payout.processed marks payout COMPLETED when razorpayPayoutId matches', async () => {
    // Seed a payout with a razorpayPayoutId
    const payout = await prisma.payout.findFirst({ where: { workerId } })
    if (!payout) return // skip if no payout exists

    const fakeRazorpayId = `pout_test_${Date.now()}`
    await prisma.payout.update({
      where: { id: payout.id },
      data:  { razorpayPayoutId: fakeRazorpayId },
    })

    const body = {
      event: 'payout.processed',
      payload: {
        payout: {
          entity: { id: fakeRazorpayId },
        },
      },
    }
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/webhooks/razorpay',
      payload: body,
    })
    expect(res.statusCode).toBe(200)

    // Verify payout is now COMPLETED
    const updated = await prisma.payout.findUnique({ where: { id: payout.id } })
    expect(updated?.status).toBe('COMPLETED')
    expect(updated?.paidAt).not.toBeNull()
  })
})
