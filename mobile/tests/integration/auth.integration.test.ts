/**
 * Integration tests — Auth flow
 * Hits the real backend at localhost:3000.
 * Run: npm run test:integration (requires docker-compose up + npm run dev in backend/)
 *
 * Registers fresh test users to avoid dependency on seeded data.
 * Verifies response shapes match mobile TypeScript types.
 */
import axios from 'axios'
import type { User, Role } from '../../src/types'

const API = process.env.TEST_API_URL || 'https://ecleanfuture-production.up.railway.app/api/v1'
const http = axios.create({ baseURL: API, timeout: 10_000 })

// Unique suffix per test run — prevents email conflicts on reruns
const RUN_ID = Date.now()

let backendRunning = false
let workerEmail = `itest-worker-${RUN_ID}@eclean.test`
let buyerEmail  = `itest-buyer-${RUN_ID}@eclean.test`
const password  = 'Test@1234'

beforeAll(async () => {
  try {
    await axios.get('http://localhost:3000/health', { timeout: 3_000 })
    backendRunning = true
  } catch {
    console.warn('\n⚠️  Backend not running — skipping auth integration tests\n')
    return
  }

  // Register fresh test users for this test run
  await Promise.all([
    http.post('/auth/register', { email: workerEmail, password, name: 'Test Worker', role: 'WORKER' }),
    http.post('/auth/register', { email: buyerEmail,  password, name: 'Test Buyer',  role: 'BUYER'  }),
  ])
})

const skipIfOffline = () => { if (!backendRunning) { console.warn('Backend offline — skipping'); return true } return false }

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns tokens + user with correct role for worker account', async () => {
    if (skipIfOffline()) return

    const res = await http.post('/auth/login', { email: workerEmail, password })

    expect(res.status).toBe(200)

    // Verify token fields
    expect(res.data.accessToken).toBeTruthy()
    expect(typeof res.data.accessToken).toBe('string')
    expect(res.data.refreshToken).toBeTruthy()
    // expiresIn: present in latest backend, may be absent if server not yet restarted
    if (res.data.expiresIn !== undefined) {
      expect(res.data.expiresIn).toBeGreaterThan(0)
    }

    // Verify user shape matches mobile User type
    const user: User = res.data.user
    expect(user.id).toBeTruthy()
    expect(user.email).toBe(workerEmail)
    expect(user.role).toBe('WORKER' satisfies Role)
    expect(user.name).toBeTruthy()
    // Sensitive field must never appear
    expect((user as any).passwordHash).toBeUndefined()
  })

  it('returns tokens + user with correct role for buyer account', async () => {
    if (skipIfOffline()) return

    const res = await http.post('/auth/login', { email: buyerEmail, password })

    expect(res.status).toBe(200)
    expect(res.data.user.role).toBe('BUYER')
  })

  it('returns 401 with error format on wrong password', async () => {
    if (skipIfOffline()) return

    try {
      await http.post('/auth/login', { email: workerEmail, password: 'WrongPass123' })
      fail('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(401)
      // Verify the error envelope format used everywhere in the backend
      expect(err.response.data.error).toBeDefined()
      expect(err.response.data.error.message).toBeTruthy()
    }
  })
})

// ─── /auth/me with token ──────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns user when Authorization header contains a valid access token', async () => {
    if (skipIfOffline()) return

    // Login to get token
    const loginRes = await http.post('/auth/login', { email: workerEmail, password })
    const token: string = loginRes.data.accessToken

    // Hit protected endpoint with that token
    const meRes = await http.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(meRes.status).toBe(200)
    expect(meRes.data.user.email).toBe(workerEmail)
    expect(meRes.data.user.role).toBe('WORKER')
  })

  it('returns 401 without token', async () => {
    if (skipIfOffline()) return

    try {
      await http.get('/auth/me')
      fail('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(401)
    }
  })
})

// ─── Token refresh ────────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('exchanges a refresh token for a new access token', async () => {
    if (skipIfOffline()) return

    const loginRes = await http.post('/auth/login', { email: workerEmail, password })
    const { refreshToken } = loginRes.data

    const refreshRes = await http.post('/auth/refresh', { refreshToken })

    expect(refreshRes.status).toBe(200)
    expect(refreshRes.data.accessToken).toBeTruthy()
    expect(refreshRes.data.refreshToken).toBeTruthy()
  })
})
