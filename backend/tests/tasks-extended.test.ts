/**
 * Extended task tests — covers all untested task endpoints
 * Covers: GET /buyer/tasks, GET /buyer/tasks/:taskId,
 *         POST /buyer/tasks/:taskId/cancel, POST /buyer/tasks/:taskId/rate,
 *         GET /buyer/tasks/:taskId/chat,
 *         GET /worker/my-tasks, GET /worker/tasks/:taskId,
 *         POST /worker/tasks/:taskId/cancel, POST /worker/tasks/:taskId/retry,
 *         POST /worker/tasks/:taskId/location,
 *         GET /worker/tasks/:taskId/chat,
 *         GET /tasks/:taskId/media
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'stream'
import type { FastifyInstance } from 'fastify'
import {
  getApp, closeApp, cleanTestData,
  registerUser, buildMultipart, TINY_JPEG,
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
let workerToken:  string  // handles tasks 3, 4, 5 in beforeAll; used in most worker tests
let worker2Token: string  // no tasks assigned — used for "empty list" my-tasks test
let worker3Token: string  // handles task 2 (ACCEPTED → cancel test)

// Shared task IDs across tests
let openTaskId:     string // OPEN task for buyer-cancel tests
let acceptedTaskId: string // ACCEPTED → worker3 cancel
let inProgressId:   string // IN_PROGRESS → location, chat (workerToken)
let rejectedTaskId: string // REJECTED → retry (workerToken)
let approvedTaskId: string // APPROVED → rate (workerToken)

async function uploadPhoto(taskId: string, token: string, mediaType: string) {
  const boundary = `Boundary-${mediaType}`
  const body = buildMultipart(boundary, { mediaType }, {
    fieldname: 'file',
    filename:  `${mediaType.toLowerCase()}.jpg`,
    mimetype:  'image/jpeg',
    data:      TINY_JPEG,
  })
  return app.inject({
    method:  'POST',
    url:     `/api/v1/tasks/${taskId}/media`,
    headers: {
      authorization:  `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  })
}

beforeAll(async () => {
  app = await getApp()

  const buyer   = await registerUser(app, 'BUYER',  'ext1')
  const worker  = await registerUser(app, 'WORKER', 'ext1')
  const worker2 = await registerUser(app, 'WORKER', 'ext1b')
  const worker3 = await registerUser(app, 'WORKER', 'ext1c')

  buyerToken   = buyer.accessToken
  workerToken  = worker.accessToken
  worker2Token = worker2.accessToken
  worker3Token = worker3.accessToken

  const makeTask = async (title: string) => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        title,
        description: `Description for ${title} — long enough for validation`,
        category:    'STREET_CLEANING',
        dirtyLevel:  'LIGHT',
      },
    })
    return JSON.parse(res.payload).task.id as string
  }

  // ── Task 1: stays OPEN for buyer-cancel ───────────────────────────────────
  openTaskId = await makeTask('Open task for buyer cancel')

  // ── Task 2: ACCEPTED → worker3 cancel ─────────────────────────────────────
  // Uses worker3 so workerToken stays free for the sequential tasks below
  acceptedTaskId = await makeTask('Accepted task for worker cancel')
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${acceptedTaskId}/accept`,
    headers: { authorization: `Bearer ${worker3Token}` },
  })

  // ── Tasks 5 → 4 → 3 done with workerToken sequentially ───────────────────
  // Each lifecycle clears workerToken.activeTaskId before the next starts.
  // Task 5 and 4 clear activeTaskId on rejection/approval.
  // Task 3 stays IN_PROGRESS at the end.

  // ── Task 5: REJECTED → retry ──────────────────────────────────────────────
  rejectedTaskId = await makeTask('Task to reject then retry')
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${rejectedTaskId}/accept`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${rejectedTaskId}/start`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  for (const t of ['BEFORE', 'AFTER', 'PROOF']) {
    await uploadPhoto(rejectedTaskId, workerToken, t)
  }
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${rejectedTaskId}/submit`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  // Rejection clears workerToken.activeTaskId
  await app.inject({
    method:  'POST',
    url:     `/api/v1/buyer/tasks/${rejectedTaskId}/reject`,
    headers: { authorization: `Bearer ${buyerToken}` },
    payload: { reason: 'Photos do not show the area was actually cleaned properly' },
  })

  // ── Task 4: APPROVED → rate ───────────────────────────────────────────────
  // workerToken.activeTaskId is now null (cleared by rejection above)
  approvedTaskId = await makeTask('Task to approve and rate')
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${approvedTaskId}/accept`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${approvedTaskId}/start`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  for (const t of ['BEFORE', 'AFTER', 'PROOF']) {
    await uploadPhoto(approvedTaskId, workerToken, t)
  }
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${approvedTaskId}/submit`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  // Approval clears workerToken.activeTaskId
  await app.inject({
    method:  'POST',
    url:     `/api/v1/buyer/tasks/${approvedTaskId}/approve`,
    headers: { authorization: `Bearer ${buyerToken}` },
  })

  // ── Task 3: IN_PROGRESS → location update + chat ──────────────────────────
  // workerToken.activeTaskId is now null (cleared by approval above)
  inProgressId = await makeTask('In-progress task')
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${inProgressId}/accept`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
  await app.inject({
    method:  'POST',
    url:     `/api/v1/worker/tasks/${inProgressId}/start`,
    headers: { authorization: `Bearer ${workerToken}` },
  })
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Buyer task list ───────────────────────────────────────────────────────────

describe('GET /api/v1/buyer/tasks', () => {
  it('returns all buyer tasks → 200 with tasks array', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.tasks.length).toBeGreaterThanOrEqual(4)
    expect(typeof body.total).toBe('number')
  })

  it('filter by status=OPEN returns only open tasks', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/tasks?status=OPEN',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    for (const t of body.tasks) {
      expect(t.status).toBe('OPEN')
    }
  })

  it('WORKER cannot list buyer tasks → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Buyer task detail ─────────────────────────────────────────────────────────

describe('GET /api/v1/buyer/tasks/:taskId', () => {
  it('returns task detail with media array', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/buyer/tasks/${approvedTaskId}`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task).toBeDefined()
    expect(body.task.id).toBe(approvedTaskId)
    expect(Array.isArray(body.task.media)).toBe(true)
    expect(body.task.media.length).toBe(3) // BEFORE + AFTER + PROOF
  })

  it('non-existent taskId → 404', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/buyer/tasks/nonexistent-task-id',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Buyer cancel task ─────────────────────────────────────────────────────────

describe('POST /api/v1/buyer/tasks/:taskId/cancel', () => {
  it('buyer cancels OPEN task → CANCELLED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${openTaskId}/cancel`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'No longer need the cleaning service for this location.' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).task.status).toBe('CANCELLED')
  })

  it('reason too short → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${openTaskId}/cancel`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'Short' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('cannot cancel already-CANCELLED task → 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${openTaskId}/cancel`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reason: 'Trying to cancel an already cancelled task for testing.' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('WORKER cannot cancel buyer task → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${openTaskId}/cancel`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { reason: 'Worker trying to use buyer endpoint for testing purposes.' },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Rate task ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/buyer/tasks/:taskId/rate', () => {
  it('buyer rates APPROVED task → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${approvedTaskId}/rate`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { rating: 5, comment: 'Excellent work, very thorough cleaning.' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('rating < 1 → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${approvedTaskId}/rate`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { rating: 0 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('rating > 5 → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/buyer/tasks/${approvedTaskId}/rate`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { rating: 6 },
    })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Buyer chat history ────────────────────────────────────────────────────────

describe('GET /api/v1/buyer/tasks/:taskId/chat', () => {
  it('returns empty messages array for new task', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/buyer/tasks/${inProgressId}/chat`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.messages)).toBe(true)
  })
})

// ─── Worker task list ──────────────────────────────────────────────────────────

describe('GET /api/v1/worker/my-tasks', () => {
  it('returns tasks assigned to this worker', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/my-tasks',
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.tasks.length).toBeGreaterThanOrEqual(1)
  })

  it('worker2 sees empty list (no tasks assigned)', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/my-tasks',
      headers: { authorization: `Bearer ${worker2Token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.tasks.length).toBe(0)
  })

  it('BUYER cannot access worker my-tasks → 403', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/worker/my-tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Worker task detail ────────────────────────────────────────────────────────

describe('GET /api/v1/worker/tasks/:taskId', () => {
  it('returns task detail for assigned task', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/worker/tasks/${inProgressId}`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.task.id).toBe(inProgressId)
    expect(body.task.status).toBe('IN_PROGRESS')
  })
})

// ─── Worker cancel task ────────────────────────────────────────────────────────

describe('POST /api/v1/worker/tasks/:taskId/cancel', () => {
  it('worker cancels ACCEPTED task → CANCELLED', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${acceptedTaskId}/cancel`,
      headers: { authorization: `Bearer ${worker3Token}` },
      payload: { reason: 'Personal emergency prevents me from completing this task.' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).task.status).toBe('CANCELLED')
  })

  it('reason too short → 422', async () => {
    const newTaskRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/buyer/tasks',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        title:       'Cancel validation task',
        description: 'A task to test cancel validation requirements',
        category:    'STREET_CLEANING',
        dirtyLevel:  'LIGHT',
      },
    })
    const newTaskId = JSON.parse(newTaskRes.payload).task.id
    await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${newTaskId}/accept`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${newTaskId}/cancel`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { reason: 'Short' },
    })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Worker retry task ─────────────────────────────────────────────────────────

describe('POST /api/v1/worker/tasks/:taskId/retry', () => {
  it('worker retries REJECTED task → status back to IN_PROGRESS', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${rejectedTaskId}/retry`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).task.status).toBe('IN_PROGRESS')
  })

  it('BUYER cannot retry task → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${rejectedTaskId}/retry`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Worker location update ────────────────────────────────────────────────────

describe('POST /api/v1/worker/tasks/:taskId/location', () => {
  it('records GPS location for IN_PROGRESS task → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${inProgressId}/location`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { lat: 12.9716, lng: 77.5946, accuracy: 5.0 },
    })
    expect(res.statusCode).toBe(200)
  })

  it('missing lat → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${inProgressId}/location`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { lng: 77.5946 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('lat out of range → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${inProgressId}/location`,
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { lat: 200, lng: 77.5946 },
    })
    expect(res.statusCode).toBe(422)
  })

  it('BUYER cannot post location → 403', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/worker/tasks/${inProgressId}/location`,
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { lat: 12.9716, lng: 77.5946 },
    })
    expect(res.statusCode).toBe(403)
  })
})

// ─── Worker chat history ───────────────────────────────────────────────────────

describe('GET /api/v1/worker/tasks/:taskId/chat', () => {
  it('returns messages array for task', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/worker/tasks/${inProgressId}/chat`,
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.messages)).toBe(true)
  })
})

// ─── Media list ────────────────────────────────────────────────────────────────

describe('GET /api/v1/tasks/:taskId/media', () => {
  it('returns all media for task', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tasks/${approvedTaskId}/media`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.media)).toBe(true)
    expect(body.media.length).toBe(3) // BEFORE + AFTER + PROOF

    const types = body.media.map((m: { type: string }) => m.type)
    expect(types).toContain('BEFORE')
    expect(types).toContain('AFTER')
    expect(types).toContain('PROOF')
  })

  it('task with no media returns empty array', async () => {
    // openTaskId was cancelled (no uploads)
    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tasks/${openTaskId}/media`,
      headers: { authorization: `Bearer ${buyerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).media.length).toBe(0)
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/tasks/${approvedTaskId}/media`,
    })
    expect(res.statusCode).toBe(401)
  })
})
