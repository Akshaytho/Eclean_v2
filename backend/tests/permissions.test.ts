/**
 * Permission / RBAC tests
 * Verifies that each role is denied access to endpoints it doesn't own
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  getApp, closeApp, cleanTestData,
  registerUser, createAdminUser,
} from './helpers/setup'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/cloudinary', () => ({
  assertCloudinaryConfigured: vi.fn(),
  cloudinary: { uploader: { upload_stream: vi.fn(), destroy: vi.fn() } },
}))

vi.mock('../src/jobs/payout.job', () => ({
  PAYOUT_QUEUE:        'payout',
  payoutQueue:         { add: vi.fn().mockResolvedValue({ id: 'mock' }) },
  createPayoutWorker:  vi.fn(() => ({ close: vi.fn() })),
}))

// ── Shared state ──────────────────────────────────────────────────────────────

const TAG = `perm_${Date.now()}`
let app: FastifyInstance

let buyerToken:   string
let workerToken:  string
let citizenToken: string
let taskId:       string

beforeAll(async () => {
  await cleanTestData()
  app = await getApp()

  const buyer   = await registerUser(app, 'BUYER',   `${TAG}_b`)
  const worker  = await registerUser(app, 'WORKER',  `${TAG}_w`)
  const citizen = await registerUser(app, 'CITIZEN', `${TAG}_c`)

  expect(buyer.statusCode).toBe(201)
  expect(worker.statusCode).toBe(201)
  expect(citizen.statusCode).toBe(201)

  buyerToken   = buyer.accessToken
  workerToken  = worker.accessToken
  citizenToken = citizen.accessToken

  // Buyer creates a task so we have a taskId for the role tests
  const taskRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/buyer/tasks',
    headers: { authorization: `Bearer ${buyerToken}` },
    payload: {
      title:       'Permission test task with enough text',
      description: 'This task is only used to test role-based access control',
      category:    'STREET_CLEANING',
      dirtyLevel:  'LIGHT',
      urgency:     'LOW',
    },
  })
  expect(taskRes.statusCode).toBe(201)
  taskId = JSON.parse(taskRes.payload).task.id
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ── Unauthenticated ────────────────────────────────────────────────────────────

describe('Unauthenticated requests', () => {
  it('GET /api/v1/auth/me without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/buyer/tasks without token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/buyer/tasks', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/worker/tasks/open without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/worker/tasks/open' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/admin/disputes without token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/disputes' })
    expect(res.statusCode).toBe(401)
  })
})

// ── Worker calling Buyer endpoints ────────────────────────────────────────────

describe('Worker calling Buyer-only endpoints', () => {
  it('Worker POST /api/v1/buyer/tasks → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        title:       'Unauthorised task creation attempt',
        description: 'Worker should not be able to create tasks via buyer endpoint',
        category:    'GARBAGE_COLLECTION',
        dirtyLevel:  'LIGHT',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Worker POST /api/v1/buyer/tasks/:id/approve → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId}/approve`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Worker POST /api/v1/buyer/tasks/:id/reject → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId}/reject`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { reason: 'Worker should not be able to reject tasks as buyer' },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ── Buyer calling Worker endpoints ────────────────────────────────────────────

describe('Buyer calling Worker-only endpoints', () => {
  it('Buyer POST /api/v1/worker/tasks/:id/accept → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/accept`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Buyer POST /api/v1/worker/tasks/:id/start → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/start`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Buyer POST /api/v1/worker/tasks/:id/submit → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/submit`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ── Citizen calling task endpoints ────────────────────────────────────────────

describe('Citizen calling task endpoints', () => {
  it('Citizen POST /api/v1/buyer/tasks (create task) → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        title:       'Citizen tries to create a task',
        description: 'Citizens cannot post tasks — they can only file reports',
        category:    'GARBAGE_COLLECTION',
        dirtyLevel:  'LIGHT',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Citizen POST /api/v1/worker/tasks/:id/accept → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${taskId}/accept`,
      headers: { authorization: `Bearer ${citizenToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ── Worker cannot approve own submission ──────────────────────────────────────

describe('Worker approving own submission', () => {
  it('Worker POST /api/v1/buyer/tasks/:id/approve (buyer endpoint) → 403', async () => {
    // Worker attempts to call the buyer's approve endpoint
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${taskId}/approve`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ── Admin-only endpoints ──────────────────────────────────────────────────────

describe('Non-admin calling Admin endpoints', () => {
  it('Buyer GET /api/v1/admin/disputes → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/disputes',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Worker POST /api/v1/admin/disputes/:id/resolve → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/disputes/${taskId}/resolve`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { decision: 'APPROVE', adminNotes: 'Attempted admin action by worker' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('Citizen GET /api/v1/admin/users → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/users',
      headers: { authorization: `Bearer ${citizenToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
