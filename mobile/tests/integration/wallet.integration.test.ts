/**
 * Integration tests — Worker wallet + payout history
 * Registers a fresh worker and verifies wallet/payout endpoints.
 */
import axios from 'axios'
import type { WalletData } from '../../src/types'

const API = process.env.TEST_API_URL || 'https://ecleanfuture-production.up.railway.app/api/v1'
const http = axios.create({ baseURL: API, timeout: 10_000 })

const RUN_ID = Date.now()
const password = 'Test@1234'
let backendRunning = false
let workerToken: string

beforeAll(async () => {
  try {
    await axios.get('http://localhost:3000/health', { timeout: 3_000 })
    backendRunning = true
  } catch {
    console.warn('\n⚠️  Backend not running — skipping wallet integration tests\n')
    return
  }

  const res = await http.post('/auth/register', {
    email: `itest-wallet-${RUN_ID}@eclean.test`,
    password,
    name: 'Wallet Worker',
    role: 'WORKER',
  })
  workerToken = res.data.accessToken
})

const skipIfOffline = () => { if (!backendRunning) { console.warn('Backend offline — skipping'); return true } return false }
const workerAuth = () => ({ headers: { Authorization: `Bearer ${workerToken}` } })

// ─── Wallet ───────────────────────────────────────────────────────────────────

describe('GET /worker/wallet', () => {
  it('returns WalletData with all required fields as integer paise', async () => {
    if (skipIfOffline()) return

    const res = await http.get('/worker/wallet', workerAuth())

    expect(res.status).toBe(200)

    const wallet: WalletData = res.data
    expect(typeof wallet.pendingCents).toBe('number')
    expect(typeof wallet.processingCents).toBe('number')
    expect(typeof wallet.availableCents).toBe('number')
    expect(typeof wallet.totalEarnedCents).toBe('number')
    expect(typeof wallet.completedTasksCount).toBe('number')

    // Money must always be integer paise — never floats
    expect(Number.isInteger(wallet.pendingCents)).toBe(true)
    expect(Number.isInteger(wallet.processingCents)).toBe(true)
    expect(Number.isInteger(wallet.availableCents)).toBe(true)
    expect(Number.isInteger(wallet.totalEarnedCents)).toBe(true)

    // New worker has zero earnings
    expect(wallet.pendingCents).toBe(0)
    expect(wallet.availableCents).toBe(0)
    expect(wallet.totalEarnedCents).toBe(0)
    expect(wallet.completedTasksCount).toBe(0)
  })
})

// ─── Payout history ───────────────────────────────────────────────────────────

describe('GET /worker/payouts', () => {
  it('returns paginated payout list (empty for new worker)', async () => {
    if (skipIfOffline()) return

    const res = await http.get('/worker/payouts', {
      ...workerAuth(),
      params: { page: 1 },
    })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.payouts)).toBe(true)
    expect(res.data.total).toBe(0)
    expect(res.data.page).toBe(1)
    expect(res.data.limit).toBeGreaterThan(0)
  })
})

// ─── Authorization enforcement ────────────────────────────────────────────────

describe('Wallet routes require auth', () => {
  it('returns 401 when no token is provided', async () => {
    if (skipIfOffline()) return

    try {
      await http.get('/worker/wallet')
      fail('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(401)
    }
  })
})
