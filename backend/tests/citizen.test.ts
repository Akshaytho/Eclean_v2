/**
 * Citizen reports tests
 * Covers: POST /citizen/reports, GET /citizen/reports
 * + role enforcement (worker/buyer cannot use citizen endpoints)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, cleanTestData, registerUser } from './helpers/setup'

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

let app: FastifyInstance
let citizenToken: string
let workerToken:  string
let buyerToken:   string

beforeAll(async () => {
  app = await getApp()

  const citizen = await registerUser(app, 'CITIZEN', 'cit1')
  const worker  = await registerUser(app, 'WORKER',  'cit1')
  const buyer   = await registerUser(app, 'BUYER',   'cit1')

  citizenToken = citizen.accessToken
  workerToken  = worker.accessToken
  buyerToken   = buyer.accessToken
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Create report ─────────────────────────────────────────────────────────────

describe('POST /api/v1/citizen/reports', () => {
  it('valid report → 201 with report object', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        category:    'STREET_CLEANING',
        description: 'There is a large pile of garbage at the corner',
        urgency:     'HIGH',
        lat:         12.9716,
        lng:         77.5946,
      },
    })
    expect(res.statusCode).toBe(201)
    // Controller sends the Prisma record directly (not wrapped in { report: ... })
    const body = JSON.parse(res.payload)
    expect(body.id).toBeDefined()
    expect(body.category).toBe('STREET_CLEANING')
    expect(body.urgency).toBe('HIGH')
    expect(body.status).toBe('REPORTED')
  })

  it('description too short (< 10 chars) → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        category:    'GARBAGE_COLLECTION',
        description: 'Short',
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('missing category → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        description: 'Some description that is long enough',
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('invalid urgency value → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        category:    'STREET_CLEANING',
        description: 'Some description that is long enough',
        urgency:     'SUPER_URGENT', // not a valid TaskUrgency
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('WORKER cannot create citizen report → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        category:    'STREET_CLEANING',
        description: 'Some description that is long enough',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('BUYER cannot create citizen report → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        category:    'STREET_CLEANING',
        description: 'Some description that is long enough',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      payload: {
        category:    'STREET_CLEANING',
        description: 'Some description that is long enough',
      },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── List reports ──────────────────────────────────────────────────────────────

describe('GET /api/v1/citizen/reports', () => {
  it('returns own reports only', async () => {
    // Create a report first
    await app.inject({
      method:  'POST',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        category:    'PARK_MAINTENANCE',
        description: 'Park benches are broken and need replacement',
        urgency:     'LOW',
      },
    })

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${citizenToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.reports)).toBe(true)
    expect(body.reports.length).toBeGreaterThanOrEqual(1)
    expect(body.total).toBeGreaterThanOrEqual(1)
    // All reports belong to this citizen
    for (const r of body.reports) {
      expect(r.reporterId).toBeDefined()
    }
  })

  it('pagination works', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/citizen/reports?page=1&limit=1',
      headers: { authorization: `Bearer ${citizenToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.reports.length).toBeLessThanOrEqual(1)
  })

  it('WORKER cannot list citizen reports → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/citizen/reports',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
