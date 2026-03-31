/**
 * Reference Points — Edge Cases & Fraud Integration Tests
 *
 * Covers:
 * - Concurrent task acceptance (two workers, same task)
 * - Task cancellation mid-progress (buyer cancels after photos uploaded)
 * - Citizen DIRTY rating + trust score impact
 * - Max reference points limit (11th photo rejected)
 * - Worker submitting without starting task
 * - Buyer accountability: reject AI-approved work
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'stream'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import {
  getApp, closeApp, cleanTestData,
  registerUser, buildMultipart, TINY_JPEG,
} from './helpers/setup'

// ── Mocks ────────────────────────────────────────────────────────────────────

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
              secure_url: `https://res.cloudinary.com/test/image/upload/${Date.now()}_${Math.random()}.jpg`,
              public_id:  `eclean/tasks/test/${Date.now()}_${Math.random()}`,
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

vi.mock('../src/jobs/payout.job', () => ({
  PAYOUT_QUEUE:        'payout',
  payoutQueue:         { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
  createPayoutWorker:  vi.fn(() => ({ close: vi.fn() })),
}))

vi.mock('../src/jobs/ai-verify.job', () => ({
  AI_VERIFY_QUEUE:      'ai-verification',
  aiVerifyQueue:        { add: vi.fn().mockResolvedValue({ id: 'mock-ai-job' }) },
  createAiVerifyWorker: vi.fn(() => ({ close: vi.fn() })),
}))

// ── Shared state ─────────────────────────────────────────────────────────────

const TAG = `edge_${Date.now()}`
let app: FastifyInstance
let buyerToken: string
let worker1Token: string
let worker2Token: string
let citizenToken: string
let worker1Id: string
let buyerId: string

beforeAll(async () => {
  await cleanTestData()
  app = await getApp()

  const buyer = await registerUser(app, 'BUYER', TAG)
  buyerToken = buyer.accessToken
  buyerId = buyer.user.id

  const w1 = await registerUser(app, 'WORKER', `${TAG}_w1`)
  worker1Token = w1.accessToken
  worker1Id = w1.user.id

  const w2 = await registerUser(app, 'WORKER', `${TAG}_w2`)
  worker2Token = w2.accessToken

  const citizen = await registerUser(app, 'CITIZEN', TAG)
  citizenToken = citizen.accessToken
}, 30_000)

afterAll(async () => {
  // cleanup moved to beforeAll
  // app cleanup handled by vitest
})

// Helper to create a task with reference points
async function createTaskWithRefPoints(title: string, numPoints: number): Promise<string> {
  const taskRes = await app.inject({
    method: 'POST', url: '/api/v1/buyer/tasks',
    headers: { authorization: `Bearer ${buyerToken}` },
    payload: { title, description: `Test for ${title} — long enough`, category: 'STREET_CLEANING', dirtyLevel: 'MEDIUM' },
  })
  const taskId = JSON.parse(taskRes.payload).task.id

  for (let i = 1; i <= numPoints; i++) {
    const boundary = `----b${Date.now()}${i}`
    const body = buildMultipart(boundary, { pointIndex: String(i) },
      { fieldname: 'file', filename: `ref_${i}.jpg`, mimetype: 'image/jpeg', data: TINY_JPEG })
    await app.inject({
      method: 'POST', url: `/api/v1/tasks/${taskId}/reference-points`,
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
  }

  return taskId
}

// ─── CONCURRENT ACCEPTANCE ───────────────────────────────────────────────────

describe('Concurrent task acceptance', () => {
  it('two workers accept same task → one gets 200, other gets 409', async () => {
    const taskId = await createTaskWithRefPoints('Concurrent accept test', 2)

    // Fire both accepts simultaneously
    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker1Token}` } }),
      app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker2Token}` } }),
    ])

    const codes = [res1.statusCode, res2.statusCode].sort()
    // One should succeed (200), one should conflict (409)
    expect(codes).toContain(200)
    expect(codes).toContain(409)

    // Only one worker should be assigned
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    expect(task?.workerId).toBeTruthy()
    expect(task?.status).toBe('ACCEPTED')

    // Clean up: cancel so worker1 is free for next tests
    await prisma.task.update({ where: { id: taskId }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    await prisma.workerProfile.update({ where: { userId: worker1Id }, data: { activeTaskId: null } })
  })
})

// ─── MAX REFERENCE POINTS ────────────────────────────────────────────────────

describe('Reference point limits', () => {
  it('rejects 11th reference point (max 10)', async () => {
    const taskRes = await app.inject({
      method: 'POST', url: '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { title: 'Max points test', description: 'Testing max reference point limit', category: 'PARK_CLEANING', dirtyLevel: 'LIGHT' },
    })
    const taskId = JSON.parse(taskRes.payload).task.id

    // Upload 10 points
    for (let i = 1; i <= 10; i++) {
      const boundary = `----bmax${Date.now()}${i}`
      const body = buildMultipart(boundary, { pointIndex: String(i) },
        { fieldname: 'file', filename: `max_${i}.jpg`, mimetype: 'image/jpeg', data: TINY_JPEG })
      const res = await app.inject({
        method: 'POST', url: `/api/v1/tasks/${taskId}/reference-points`,
        headers: { authorization: `Bearer ${buyerToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body,
      })
      expect(res.statusCode).toBe(201)
    }

    // 11th should fail
    const boundary = `----bmax${Date.now()}11`
    const body = buildMultipart(boundary, { pointIndex: '11' },
      { fieldname: 'file', filename: `max_11.jpg`, mimetype: 'image/jpeg', data: TINY_JPEG })
    const res = await app.inject({
      method: 'POST', url: `/api/v1/tasks/${taskId}/reference-points`,
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })

    expect(res.statusCode).toBe(400) // either Zod rejects pointIndex>10 or service rejects count>10
  })
})

// ─── TASK CANCELLATION MID-PROGRESS ──────────────────────────────────────────

describe('Task cancellation mid-progress', () => {
  it('buyer cancels after worker uploaded photos → task CANCELLED, worker freed', async () => {
    const taskId = await createTaskWithRefPoints('Cancel mid test', 3)

    // Worker accepts + starts
    await app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker1Token}` } })
    await new Promise(r => setTimeout(r, 300))
    await prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } })

    // Worker uploads 2 photos
    const points = await prisma.taskReferencePoint.findMany({ where: { taskId }, take: 2 })
    for (const pt of points) {
      const boundary = `----bcancel${Date.now()}`
      const body = buildMultipart(boundary, { mediaType: 'AFTER' },
        { fieldname: 'file', filename: 'after.jpg', mimetype: 'image/jpeg', data: TINY_JPEG })
      await app.inject({
        method: 'POST', url: `/api/v1/tasks/${taskId}/points/${pt.id}/submit`,
        headers: { authorization: `Bearer ${worker1Token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body,
      })
    }

    // Verify submissions exist
    const subCount = await prisma.workerPointSubmission.count({ where: { taskId } })
    expect(subCount).toBe(2)

    // Buyer cancels
    const cancelRes = await app.inject({
      method: 'POST', url: `/api/v1/buyer/tasks/${taskId}/cancel`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'Changed my mind about this location' },
    })
    expect(cancelRes.statusCode).toBe(200)

    // Task should be cancelled
    const task = await prisma.task.findUnique({ where: { id: taskId } })
    expect(task?.status).toBe('CANCELLED')

    // Worker should be freed
    const profile = await prisma.workerProfile.findUnique({ where: { userId: worker1Id } })
    expect(profile?.activeTaskId).toBeNull()
  })
})

// ─── CITIZEN DIRTY RATING ────────────────────────────────────────────────────

describe('Citizen DIRTY verification', () => {
  it('citizen rates DIRTY → worker trust drops, citizen gets ₹10', async () => {
    // Create a completed task
    const taskId = await createTaskWithRefPoints('Dirty citizen test', 2)
    await app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker1Token}` } })
    await new Promise(r => setTimeout(r, 300))
    // Force through to APPROVED
    await prisma.task.update({ where: { id: taskId }, data: { status: 'APPROVED', completedAt: new Date(), startedAt: new Date() } })

    // Get worker trust score before
    const profileBefore = await prisma.workerProfile.findUnique({ where: { userId: worker1Id } })
    const trustBefore = profileBefore?.trustScore ?? 70

    // Citizen rates DIRTY with photo
    const res = await app.inject({
      method: 'POST', url: `/api/v1/citizen/verify/${taskId}`,
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        rating: 'DIRTY',
        photoUrl: 'https://res.cloudinary.com/test/dirty_proof.jpg',
        capturedLat: 12.97,
        capturedLng: 77.59,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.verification.rating).toBe('DIRTY')
    expect(body.verification.rewardAmount).toBe(1000) // ₹10 for finding fraud

    // Worker trust should drop (async — give it a moment)
    await new Promise(r => setTimeout(r, 500))
    const profileAfter = await prisma.workerProfile.findUnique({ where: { userId: worker1Id } })
    expect(profileAfter?.trustScore).toBeLessThan(trustBefore)

    // Clean up
    await prisma.workerProfile.update({ where: { userId: worker1Id }, data: { activeTaskId: null } })
  })
})

// ─── BUYER ACCOUNTABILITY ────────────────────────────────────────────────────

describe('Buyer accountability', () => {
  it('buyer rejects AI-approved task → falseRejectionCount increments + trust drops', async () => {
    const taskId = await createTaskWithRefPoints('Buyer fraud test', 2)

    // Fast-track to SUBMITTED with high AI score
    await app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker1Token}` } })
    await new Promise(r => setTimeout(r, 300))
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'SUBMITTED', startedAt: new Date(), submittedAt: new Date(),
        aiScore: 0.92, aiReasoning: 'Excellent cleaning work',
      },
    })

    // Get buyer profile before
    const buyerBefore = await prisma.buyerProfile.findUnique({ where: { userId: buyerId } })
    const rejectsBefore = buyerBefore?.falseRejectionCount ?? 0

    // Buyer rejects despite AI score 0.92
    const res = await app.inject({
      method: 'POST', url: `/api/v1/buyer/tasks/${taskId}/reject`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'I do not think this is clean enough for my standards' },
    })
    expect(res.statusCode).toBe(200)

    // Wait for async buyer accountability update
    await new Promise(r => setTimeout(r, 500))

    const buyerAfter = await prisma.buyerProfile.findUnique({ where: { userId: buyerId } })
    expect(buyerAfter?.falseRejectionCount).toBeGreaterThan(rejectsBefore)
    expect(buyerAfter?.buyerTrustScore).toBeLessThan(buyerBefore?.buyerTrustScore ?? 70)

    // Clean up
    await prisma.workerProfile.update({ where: { userId: worker1Id }, data: { activeTaskId: null } })
  })
})

// ─── WORKER SUBMITTING WITHOUT ENOUGH PHOTOS ─────────────────────────────────

describe('Submit validation edge cases', () => {
  it('worker cannot submit with 0 photos even though task has 0 ref points (legacy)', async () => {
    // Create task without reference points
    const taskRes = await app.inject({
      method: 'POST', url: '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { title: 'Legacy no photos test', description: 'Testing submit without any photos at all', category: 'DRAIN_CLEANING', dirtyLevel: 'LIGHT' },
    })
    const taskId = JSON.parse(taskRes.payload).task.id

    await app.inject({ method: 'POST', url: `/api/v1/worker/tasks/${taskId}/accept`, headers: { authorization: `Bearer ${worker1Token}` } })
    await new Promise(r => setTimeout(r, 300))
    await prisma.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } })

    // Try to submit with no photos
    const res = await app.inject({
      method: 'POST', url: `/api/v1/worker/tasks/${taskId}/submit`,
      headers: { authorization: `Bearer ${worker1Token}` },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload).error.message).toContain('BEFORE')

    // Clean up
    await prisma.task.update({ where: { id: taskId }, data: { status: 'CANCELLED' } })
    await prisma.workerProfile.update({ where: { userId: worker1Id }, data: { activeTaskId: null } })
  })
})
