/**
 * Zones + Supervisor tests
 * Covers: POST /zones, GET /zones, PATCH /zones/:id/inspect,
 *         GET /supervisor/dashboard, GET /supervisor/tasks,
 *         POST /supervisor/tasks/:id/flag
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import {
  getApp, closeApp, cleanTestData,
  registerUser, createAdminUser, createSupervisorUser,
} from './helpers/setup'

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

let app:            FastifyInstance
let adminToken:     string
let supervisorToken:string
let workerToken:    string
let zoneId:         string

beforeAll(async () => {
  app = await getApp()

  const admin      = await createAdminUser('zs1')
  const supervisor = await createSupervisorUser('zs1')
  const worker     = await registerUser(app, 'WORKER', 'zs1')

  adminToken      = admin.accessToken
  supervisorToken = supervisor.accessToken
  workerToken     = worker.accessToken
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Create zone ───────────────────────────────────────────────────────────────

describe('POST /api/v1/zones', () => {
  it('ADMIN creates zone → 201 with zone object', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/zones',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name:         'Koramangala Zone A',
        city:         'Bengaluru',
        lat:          12.9352,
        lng:          77.6245,
        radiusMeters: 2000,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.id).toBeDefined()
    expect(body.name).toBe('Koramangala Zone A')
    expect(body.city).toBe('Bengaluru')
    zoneId = body.id
  })

  it('missing required field (name) → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/zones',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        city:         'Bengaluru',
        lat:          12.9352,
        lng:          77.6245,
        radiusMeters: 2000,
      },
    })
    expect(res.statusCode).toBe(422)
  })

  it('SUPERVISOR cannot create zone → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/zones',
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        name:         'Unauthorized Zone',
        city:         'Bengaluru',
        lat:          12.9,
        lng:          77.6,
        radiusMeters: 1000,
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('WORKER cannot create zone → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/zones',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        name:         'Worker Zone',
        city:         'Bengaluru',
        lat:          12.9,
        lng:          77.6,
        radiusMeters: 1000,
      },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── List zones ────────────────────────────────────────────────────────────────

describe('GET /api/v1/zones', () => {
  it('authenticated user gets zone list', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/zones',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body)).toBe(true)
  })

  it('filter by city returns only matching zones', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/zones?city=Bengaluru',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    for (const zone of body) {
      expect(zone.city).toBe('Bengaluru')
    }
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/zones',
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Inspect zone ──────────────────────────────────────────────────────────────

describe('PATCH /api/v1/zones/:id/inspect', () => {
  it('SUPERVISOR inspects zone → 200 with updated dirtyLevel', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/zones/${zoneId}/inspect`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: { dirtyLevel: 'HEAVY', note: 'Multiple dumping spots found near the main road.' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.dirtyLevel).toBe('HEAVY')
  })

  it('invalid dirtyLevel → 422', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/zones/${zoneId}/inspect`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: { dirtyLevel: 'MODERATE' }, // not a valid DirtyLevel
    })
    expect(res.statusCode).toBe(422)
  })

  it('WORKER cannot inspect zone → 403', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/v1/zones/${zoneId}/inspect`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { dirtyLevel: 'LIGHT' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('non-existent zone → 404', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     '/api/v1/zones/00000000-0000-0000-0000-000000000000/inspect',
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: { dirtyLevel: 'LIGHT' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Supervisor dashboard ──────────────────────────────────────────────────────

describe('GET /api/v1/supervisor/dashboard', () => {
  it('SUPERVISOR gets dashboard → 200 with summary stats', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/supervisor/dashboard',
      headers: { authorization: `Bearer ${supervisorToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    // Dashboard should have some stats fields
    expect(body).toBeDefined()
  })

  it('WORKER cannot access supervisor dashboard → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/supervisor/dashboard',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Supervisor task list ──────────────────────────────────────────────────────

describe('GET /api/v1/supervisor/tasks', () => {
  it('SUPERVISOR gets task list → 200 with tasks array', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/supervisor/tasks',
      headers: { authorization: `Bearer ${supervisorToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.tasks)).toBe(true)
  })

  it('pagination params are respected', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/supervisor/tasks?page=1&limit=5',
      headers: { authorization: `Bearer ${supervisorToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.tasks.length).toBeLessThanOrEqual(5)
  })

  it('WORKER cannot access supervisor tasks → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/supervisor/tasks',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Supervisor flag task ──────────────────────────────────────────────────────

describe('POST /api/v1/supervisor/tasks/:id/flag', () => {
  let taskId: string

  beforeAll(async () => {
    // Create a buyer + task to flag
    const buyer = await registerUser(app, 'BUYER', 'zs_flag1')
    const taskRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyer.accessToken}` },
      payload: {
        title:       'Flag me task',
        description: 'Task to be flagged by supervisor for testing purposes',
        category:    'STREET_CLEANING',
        dirtyLevel:  'LIGHT',
      },
    })
    taskId = JSON.parse(taskRes.payload).task.id
  })

  it('SUPERVISOR flags task → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/supervisor/tasks/${taskId}/flag`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: { reason: 'Task location is outside the monitored zone boundary.' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('reason too short → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/supervisor/tasks/${taskId}/flag`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: { reason: 'Short' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('WORKER cannot flag task → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/supervisor/tasks/${taskId}/flag`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { reason: 'This is a long enough reason to pass validation check.' },
    })
    expect(res.statusCode).toBe(403)
  })
})
