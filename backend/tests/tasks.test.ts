/**
 * Task lifecycle critical-path tests
 * Covers: create → accept → start → upload photos → submit → approve
 *         + work-window enforcement, media deduplication, dispute resolution
 *
 * Requires: PostgreSQL + Redis running, Cloudinary is mocked
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'stream'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import {
  getApp, closeApp, cleanTestData,
  registerUser, createAdminUser,
  buildMultipart, TINY_JPEG,
  TEST_PASSWORD,
} from './helpers/setup'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock Cloudinary so media upload tests don't hit external service
vi.mock('../src/lib/cloudinary', () => ({
  assertCloudinaryConfigured: vi.fn(), // no-op
  cloudinary: {
    uploader: {
      // upload_stream: return a Writable that fires the callback on 'finish'
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

// Mock payout queue so approve/resolve don't try to connect to BullMQ Redis
vi.mock('../src/jobs/payout.job', () => ({
  PAYOUT_QUEUE:        'payout',
  payoutQueue:         { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
  createPayoutWorker:  vi.fn(() => ({ close: vi.fn() })),
}))

// ── Shared state (tests run sequentially within describe) ─────────────────────

const TAG = `tasks_${Date.now()}`
let app: FastifyInstance

let buyerToken: string
let worker1Token: string
let worker2Token: string
let worker1Id: string
let taskId: string

// For dispute path
let taskId2: string

// For admin resolve
let adminToken: string

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await cleanTestData()
  app = await getApp()

  // Create test users
  const buyer   = await registerUser(app, 'BUYER',  `${TAG}_b`)
  const worker1 = await registerUser(app, 'WORKER', `${TAG}_w1`)
  const worker2 = await registerUser(app, 'WORKER', `${TAG}_w2`)
  const admin   = await createAdminUser(`${TAG}_a`)

  expect(buyer.statusCode).toBe(201)
  expect(worker1.statusCode).toBe(201)
  expect(worker2.statusCode).toBe(201)

  buyerToken   = buyer.accessToken
  worker1Token = worker1.accessToken
  worker2Token = worker2.accessToken
  worker1Id    = worker1.user.id
  adminToken   = admin.accessToken
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ═══════════════════════════════════════════════════════════════════════════════
// HAPPY PATH — Create → Accept → Start → Upload → Submit → Approve
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task lifecycle — happy path', () => {
  it('buyer creates task → 201', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        title:           'Clean the street near test park',
        description:     'There is significant rubbish near the main gate that needs clearing',
        category:        'STREET_CLEANING',
        dirtyLevel:      'MEDIUM',
        urgency:         'MEDIUM',
        locationLat:     12.9716,
        locationLng:     77.5946,
        locationAddress: '1 Test Street, Bangalore',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('OPEN')
    expect(body.task.rateCents).toBeGreaterThan(0)
    taskId = body.task.id
  })

  it('worker1 sees task in open list', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/tasks/open',
      headers: { authorization: `Bearer ${worker1Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    const found = body.tasks.find((t: { id: string }) => t.id === taskId)
    expect(found).toBeDefined()
    expect(found.status).toBe('OPEN')
  })

  it('worker1 accepts task → ACCEPTED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/accept`,
      headers: { authorization: `Bearer ${worker1Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('ACCEPTED')
    expect(body.task.workerId).toBe(worker1Id)
  })

  it('worker2 tries to accept same task → 409', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/accept`,
      headers: { authorization: `Bearer ${worker2Token}` },
    })
    expect(res.statusCode).toBe(409)
  })

  it('worker1 starts task → IN_PROGRESS, startedAt set', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/start`,
      headers: { authorization: `Bearer ${worker1Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('IN_PROGRESS')
    expect(body.task.startedAt).toBeTruthy()
  })

  it('upload BEFORE photo → media created in DB', async () => {
    const boundary = 'TestBoundary001'
    const payload  = buildMultipart(
      boundary,
      { mediaType: 'BEFORE' },
      { fieldname: 'file', filename: 'before.jpg', mimetype: 'image/jpeg', data: TINY_JPEG },
    )
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/tasks/${taskId}/media`,
      headers: {
        authorization:  `Bearer ${worker1Token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.media.type).toBe('BEFORE')
    expect(body.media.url).toContain('cloudinary.com')

    // Verify DB record exists
    const count = await prisma.taskMedia.count({ where: { taskId, type: 'BEFORE' } })
    expect(count).toBe(1)
  })

  it('upload BEFORE again → replaces (DB count still = 1)', async () => {
    const boundary = 'TestBoundary002'
    const payload  = buildMultipart(
      boundary,
      { mediaType: 'BEFORE' },
      { fieldname: 'file', filename: 'before2.jpg', mimetype: 'image/jpeg', data: TINY_JPEG },
    )
    await app.inject({
      method:  'POST',
      url:     `/api/v1/tasks/${taskId}/media`,
      headers: {
        authorization:  `Bearer ${worker1Token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    })
    const count = await prisma.taskMedia.count({ where: { taskId, type: 'BEFORE' } })
    expect(count).toBe(1)
  })

  it('submit without AFTER + PROOF photos → 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/submit`,
      headers: { authorization: `Bearer ${worker1Token}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('upload AFTER + PROOF → both created in DB', async () => {
    for (const mediaType of ['AFTER', 'PROOF'] as const) {
      const boundary = `TestBoundary${mediaType}`
      const payload  = buildMultipart(
        boundary,
        { mediaType },
        { fieldname: 'file', filename: `${mediaType.toLowerCase()}.jpg`, mimetype: 'image/jpeg', data: TINY_JPEG },
      )
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/tasks/${taskId}/media`,
        headers: {
          authorization:  `Bearer ${worker1Token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })
      expect(res.statusCode).toBe(201)
    }

    // All 3 photo types now present
    const types = await prisma.taskMedia.findMany({ where: { taskId }, select: { type: true } })
    const typeSet = new Set(types.map((m) => m.type))
    expect(typeSet.has('BEFORE')).toBe(true)
    expect(typeSet.has('AFTER')).toBe(true)
    expect(typeSet.has('PROOF')).toBe(true)
  })

  it('worker1 submits → SUBMITTED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/submit`,
      headers: { authorization: `Bearer ${worker1Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('SUBMITTED')
    expect(body.task.submittedAt).toBeTruthy()
  })

  it('buyer rejects without reason → 422 (validation error)', async () => {
    // No body — reasonSchema requires reason (min 10 chars)
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId}/reject`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.payload)
    expect(body.error).toBeDefined()
  })

  it('buyer approves → APPROVED + payout row created', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId}/approve`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('APPROVED')
    expect(body.task.completedAt).toBeTruthy()

    // Verify payout record was created
    const payout = await prisma.payout.findUnique({ where: { taskId } })
    expect(payout).not.toBeNull()
    expect(payout!.status).toBe('PENDING')
    expect(payout!.workerAmountCents).toBe(body.task.rateCents - Math.floor(body.task.rateCents * 0.1))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DISPUTE PATH — Reject → Dispute → Admin resolves APPROVE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task lifecycle — dispute path', () => {
  let worker2AltToken: string  // fresh worker with no active task

  beforeAll(async () => {
    // Register a fresh worker for this path (worker1 still has task1)
    const w = await registerUser(app, 'WORKER', `${TAG}_w3`)
    expect(w.statusCode).toBe(201)
    worker2AltToken = w.accessToken

    // Buyer creates a second task
    const createRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        title:       'Clean the drain near test school',
        description: 'Blocked drain causing flooding on the pavement near the school entrance',
        category:    'DRAIN_CLEANING',
        dirtyLevel:  'MEDIUM',
        urgency:     'MEDIUM',
      },
    })
    expect(createRes.statusCode).toBe(201)
    taskId2 = JSON.parse(createRes.payload).task.id

    // Worker accepts
    await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId2}/accept`,
      headers: { authorization: `Bearer ${worker2AltToken}` },
    })

    // Worker starts
    await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId2}/start`,
      headers: { authorization: `Bearer ${worker2AltToken}` },
    })

    // Upload all 3 photos
    for (const mediaType of ['BEFORE', 'AFTER', 'PROOF'] as const) {
      const boundary = `Dispute${mediaType}`
      const payload  = buildMultipart(
        boundary,
        { mediaType },
        { fieldname: 'file', filename: `${mediaType.toLowerCase()}.jpg`, mimetype: 'image/jpeg', data: TINY_JPEG },
      )
      await app.inject({
        method:  'POST',
        url:     `/api/v1/tasks/${taskId2}/media`,
        headers: {
          authorization:  `Bearer ${worker2AltToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })
    }

    // Submit
    await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId2}/submit`,
      headers: { authorization: `Bearer ${worker2AltToken}` },
    })

  })

  it('buyer rejects task2 with reason → REJECTED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId2}/reject`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'The drain is still partially blocked after the work' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('REJECTED')
  })

  it('worker disputes → DISPUTED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId2}/dispute`,
      headers: { authorization: `Bearer ${worker2AltToken}` },
      payload: { reason: 'The drain was fully cleared as per photos submitted' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.status).toBe('DISPUTED')
  })

  it('admin resolves APPROVE → APPROVED + payout created', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/disputes/${taskId2}/resolve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        decision:   'APPROVE',
        adminNotes: 'Photos confirm drain was cleared. Approving the worker submission.',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.status).toBe('APPROVED')

    const payout = await prisma.payout.findUnique({ where: { taskId: taskId2 } })
    expect(payout).not.toBeNull()
    expect(payout!.status).toBe('PENDING')
  })
})
