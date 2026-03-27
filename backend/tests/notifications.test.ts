/**
 * Notifications tests
 * Covers: POST /device-token, GET /, POST /read-all, POST /:id/read
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/prisma'
import { getApp, closeApp, cleanTestData, registerUser } from './helpers/setup'

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

let app:        FastifyInstance
let userToken:  string
let userId:     string

beforeAll(async () => {
  app = await getApp()
  const user = await registerUser(app, 'WORKER', 'notif1')
  userToken  = user.accessToken
  userId     = user.user.id
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ─── Device token ─────────────────────────────────────────────────────────────

describe('POST /api/v1/notifications/device-token', () => {
  it('saves expo push token → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/notifications/device-token',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).success).toBe(true)
  })

  it('empty token string → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/notifications/device-token',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { token: '' },
    })
    expect(res.statusCode).toBe(422)
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/notifications/device-token',
      payload: { token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── List notifications ────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns empty list for new user', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/notifications',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(Array.isArray(body.notifications)).toBe(true)
    expect(typeof body.unreadCount).toBe('number')
  })

  it('returns notification seeded in DB with correct unreadCount', async () => {
    // Seed a notification directly
    await prisma.notification.create({
      data: {
        userId,
        type:  'TASK_ASSIGNED',
        title: 'New task available',
        body:  'A new cleaning task is available near you.',
        data:  {},
      },
    })

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/notifications',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.notifications.length).toBeGreaterThanOrEqual(1)
    expect(body.unreadCount).toBeGreaterThanOrEqual(1)

    // Notification shape
    const notif = body.notifications[0]
    expect(notif.id).toBeDefined()
    expect(notif.title).toBeDefined()
    expect(notif.isRead).toBe(false)
  })

  it('unauthenticated → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/notifications',
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Mark one read ─────────────────────────────────────────────────────────────

describe('POST /api/v1/notifications/:id/read', () => {
  let notifId: string

  beforeAll(async () => {
    const notif = await prisma.notification.create({
      data: {
        userId,
        type:  'TASK_ASSIGNED',
        title: 'Mark me read',
        body:  'Test notification for read marking.',
        data:  {},
      },
    })
    notifId = notif.id
  })

  it('marks notification as read → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/notifications/${notifId}/read`,
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).success).toBe(true)

    // Verify it's actually read in DB
    const updated = await prisma.notification.findUnique({ where: { id: notifId } })
    expect(updated?.isRead).toBe(true)
  })

  it('invalid UUID → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/notifications/not-a-uuid/read',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Mark all read ─────────────────────────────────────────────────────────────

describe('POST /api/v1/notifications/read-all', () => {
  beforeAll(async () => {
    // Seed two unread notifications
    await prisma.notification.createMany({
      data: [
        { userId, type: 'TASK_ASSIGNED', title: 'Notif A', body: 'Body A', data: {} },
        { userId, type: 'TASK_ASSIGNED', title: 'Notif B', body: 'Body B', data: {} },
      ],
    })
  })

  it('marks all notifications read → 200, unreadCount drops to 0', async () => {
    const markRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/notifications/read-all',
      headers: { authorization: `Bearer ${userToken}` },
    })
    expect(markRes.statusCode).toBe(200)
    expect(JSON.parse(markRes.payload).success).toBe(true)

    // Verify unreadCount is 0
    const listRes = await app.inject({
      method:  'GET',
      url:     '/api/v1/notifications',
      headers: { authorization: `Bearer ${userToken}` },
    })
    const body = JSON.parse(listRes.payload)
    expect(body.unreadCount).toBe(0)
  })
})
