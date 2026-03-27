/**
 * Auth critical-path tests
 * Requires: PostgreSQL + Redis running, DATABASE_URL + REDIS_URL env vars set
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getApp, closeApp, cleanTestData, TEST_PASSWORD } from './helpers/setup'

// ── Mock email so tests don't depend on Resend ─────────────────────────────
vi.mock('../src/lib/email', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const TAG = `auth_${Date.now()}`
const email = (suffix: string) => `test_${suffix}_${TAG}@eclean.test`

let app: FastifyInstance

beforeAll(async () => {
  await cleanTestData()
  app = await getApp()
})

afterAll(async () => {
  await cleanTestData()
  await closeApp()
})

// ── Register ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('valid registration → 201 + accessToken + refreshToken + user', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: {
        email:    email('buyer1'),
        password: TEST_PASSWORD,
        name:     'Test Buyer',
        role:     'BUYER',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.payload)
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.email).toBe(email('buyer1'))
    expect(body.user.role).toBe('BUYER')
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('duplicate email → 409', async () => {
    // Register same email twice
    await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('dup'), password: TEST_PASSWORD, name: 'Dup', role: 'WORKER' },
    })
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('dup'), password: TEST_PASSWORD, name: 'Dup2', role: 'WORKER' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('weak password (no uppercase, no digit) → 422 with field errors', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('weak'), password: 'onlylower', name: 'Weak', role: 'BUYER' },
    })
    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.payload)
    expect(body.error.details).toBeDefined()
  })

  it('invalid email format → 422', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: 'not-an-email', password: TEST_PASSWORD, name: 'Test', role: 'BUYER' },
    })
    expect(res.statusCode).toBe(422)
  })
})

// ── Login ──────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  const loginEmail = email('login_user')

  beforeAll(async () => {
    await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: loginEmail, password: TEST_PASSWORD, name: 'Login User', role: 'WORKER' },
    })
  })

  it('correct credentials → 200 + tokens', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: loginEmail, password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.email).toBe(loginEmail)
  })

  it('wrong password → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: loginEmail, password: 'WrongPass9' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('unknown email → 401 (no user enumeration)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: 'nobody@eclean.test', password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── Refresh ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  let refreshToken: string

  beforeAll(async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('refresh_user'), password: TEST_PASSWORD, name: 'Refresh User', role: 'BUYER' },
    })
    refreshToken = JSON.parse(res.payload).refreshToken
  })

  it('valid refresh token → new tokens', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    // Token rotation: old token is blacklisted
    refreshToken = body.refreshToken
  })

  it('already-used (blacklisted) refresh token → 401', async () => {
    // Use the current refreshToken once to rotate it
    const rotateRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(rotateRes.statusCode).toBe(200)
    const oldToken = refreshToken

    // Now try the old token again — it should be blacklisted
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      payload: { refreshToken: oldToken },
    })
    expect(res.statusCode).toBe(401)
  })

  it('invalid token string → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      payload: { refreshToken: 'not.a.valid.jwt' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── Logout ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout → token blacklisted → subsequent use → 401', () => {
  let accessToken: string
  let refreshToken: string

  beforeAll(async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('logout_user'), password: TEST_PASSWORD, name: 'Logout User', role: 'WORKER' },
    })
    const body = JSON.parse(res.payload)
    accessToken  = body.accessToken
    refreshToken = body.refreshToken
  })

  it('logout succeeds → 200', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/logout',
      payload: { accessToken, refreshToken },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).success).toBe(true)
  })

  it('access token is now blacklisted → GET /me → 401', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it('refresh token is now blacklisted → refresh → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── GET /me ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  let accessToken: string
  let userId: string

  beforeAll(async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/register',
      payload: { email: email('me_user'), password: TEST_PASSWORD, name: 'Me User', role: 'BUYER' },
    })
    const body = JSON.parse(res.payload)
    accessToken = body.accessToken
    userId      = body.user.id
  })

  it('valid token → 200 with user object (no password hash)', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.user.id).toBe(userId)
    expect(body.user.role).toBe('BUYER')
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('no token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('malformed bearer token → 401', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/auth/me',
      headers: { authorization: 'Bearer garbage.token.value' },
    })
    expect(res.statusCode).toBe(401)
  })
})
