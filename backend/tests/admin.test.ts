/**
 * Admin endpoints tests
 * Covers: GET /admin/dashboard, GET /admin/users, GET /admin/disputes,
 *         GET /admin/payouts, POST /admin/users/:id/deactivate,
 *         POST /admin/users/:id/activate, POST /admin/users/:id/verify-identity,
 *         POST /admin/reports/:id/convert-to-task
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  getApp, closeApp, cleanTestData,
  registerUser, createAdminUser,
} from './helpers/setup'

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

let app:         FastifyInstance
let adminToken:  string
let workerToken: string
let buyerToken:  string
let workerId:    string
let reportId:    string
let citizenToken: string

beforeAll(async () => {
  app = await getApp()

  const admin   = await createAdminUser('adm1')
  const worker  = await registerUser(app, 'WORKER',  'adm1')
  const buyer   = await registerUser(app, 'BUYER',   'adm1')
  const citizen = await registerUser(app, 'CITIZEN', 'adm1')

  adminToken   = admin.accessToken
  workerToken  = worker.accessToken
  buyerToken   = buyer.accessToken
  citizenToken = citizen.accessToken
  workerId     = worker.user.id

  // Create a citizen report so we can test convert-to-task
  const reportRes = await app.inject({
    method:  'POST',
    url:     '/api/v1/citizen/reports',
    headers: { authorization: `Bearer ${citizenToken}` },
    payload: {
      category:    'GARBAGE_COLLECTION',
      description: 'Large garbage dump blocking the main road near the market',
      urgency:     'HIGH',
      lat:         12.9716,
      lng:         77.5946,
    },
  })
  reportId = JSON.parse(reportRes.payload).id
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Admin dashboard ───────────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard', () => {
  it('ADMIN gets dashboard stats → 200', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/dashboard',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body).toBeDefined()
  })

  it('WORKER cannot access admin dashboard → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/dashboard',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('BUYER cannot access admin dashboard → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/dashboard',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Admin user list ───────────────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('returns paginated user list → 200', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.users)).toBe(true)
    expect(typeof body.total).toBe('number')
  })

  it('filter by role=WORKER returns only workers', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/users?role=WORKER',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    for (const user of body.users) {
      expect(user.role).toBe('WORKER')
    }
  })

  it('pagination works → limit respected', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/users?page=1&limit=2',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).users.length).toBeLessThanOrEqual(2)
  })

  it('BUYER cannot list users → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/users',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Deactivate / activate user ───────────────────────────────────────────────

describe('POST /api/v1/admin/users/:id/deactivate + activate', () => {
  it('ADMIN deactivates worker → isActive = false', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/users/${workerId}/deactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.isActive).toBe(false)
  })

  it('deactivated worker login returns 401', async () => {
    const loginRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: `test_worker_adm1@eclean.test`, password: 'Password1' },
    })
    expect(loginRes.statusCode).toBe(401)
  })

  it('ADMIN reactivates worker → isActive = true', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/users/${workerId}/activate`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.isActive).toBe(true)
  })

  it('reactivated worker can log in again → 200', async () => {
    const loginRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: `test_worker_adm1@eclean.test`, password: 'Password1' },
    })
    expect(loginRes.statusCode).toBe(200)
  })

  it('WORKER cannot deactivate users → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/users/${workerId}/deactivate`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('non-existent user id → 404', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/deactivate',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Verify user identity ──────────────────────────────────────────────────────

describe('POST /api/v1/admin/users/:id/verify-identity', () => {
  it('ADMIN verifies worker identity → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/users/${workerId}/verify-identity`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('BUYER cannot verify identity → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/users/${workerId}/verify-identity`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── List disputes ─────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/disputes', () => {
  it('ADMIN gets disputes list → 200', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/disputes',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.tasks)).toBe(true)
  })

  it('WORKER cannot list disputes → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/disputes',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── List admin payouts ────────────────────────────────────────────────────────

describe('GET /api/v1/admin/payouts', () => {
  it('ADMIN gets all payouts → 200', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/payouts',
      headers: { authorization: `Bearer ${adminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.payouts)).toBe(true)
  })

  it('BUYER cannot list admin payouts → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/admin/payouts',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Convert citizen report to task ───────────────────────────────────────────

describe('POST /api/v1/admin/reports/:id/convert-to-task', () => {
  it('ADMIN converts report to task → 201 with task', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/reports/${reportId}/convert-to-task`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title:     'Garbage Collection - Market Road',
        rateCents: 6000,
        urgency:   'HIGH',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.id).toBeDefined()
    expect(body.title).toBe('Garbage Collection - Market Road')
  })

  it('non-existent report id → 404', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/admin/reports/00000000-0000-0000-0000-000000000000/convert-to-task',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('BUYER cannot convert report → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/admin/reports/${reportId}/convert-to-task`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })
})
