/**
 * Unit tests for payouts.api.ts
 * Verifies wallet + payout history endpoint calls and response shapes.
 */
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '../../../src/api/client'
import { payoutsApi } from '../../../src/api/payouts.api'
import type { WalletData } from '../../../src/types'

const mock = new MockAdapter(apiClient, { onNoMatch: 'throwException' })

afterEach(() => mock.reset())
afterAll(() => mock.restore())

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockWallet: WalletData = {
  pendingCents:           0,
  processingCents:        0,
  availableCents:         6000,
  totalEarnedCents:       6000,
  completedTasksCount:    1,
}

const mockPayoutsResponse = {
  payouts: [
    {
      id:                'payout-1',
      taskId:            'task-1',
      taskTitle:         'Clean Juhu Beach',
      buyerName:         'Test Buyer',
      amountCents:       6000,
      workerAmountCents: 5400,  // 90% after platform fee
      platformFeeCents:  600,
      status:            'COMPLETED',
      razorpayPayoutId:  null,
      paidAt:            null,
      createdAt:         '2026-03-27T08:00:00.000Z',
    },
  ],
  total: 1,
  page:  1,
  limit: 20,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('payoutsApi.getWallet', () => {
  it('GETs /worker/wallet and returns all wallet fields in paise', async () => {
    mock.onGet('/worker/wallet').reply(200, mockWallet)

    const wallet = await payoutsApi.getWallet()

    expect(wallet.availableCents).toBe(6000)           // ₹60.00
    expect(wallet.totalEarnedCents).toBe(6000)
    expect(wallet.completedTasksCount).toBe(1)
    // Money is always integers — never floats
    expect(Number.isInteger(wallet.availableCents)).toBe(true)
    expect(Number.isInteger(wallet.pendingCents)).toBe(true)
  })
})

describe('payoutsApi.getPayouts', () => {
  it('GETs /worker/payouts with page param and returns payout list', async () => {
    mock.onGet('/worker/payouts').reply(200, mockPayoutsResponse)

    const result = await payoutsApi.getPayouts(1)

    expect(result.payouts).toHaveLength(1)
    expect(result.payouts[0].taskTitle).toBe('Clean Juhu Beach')
    expect(result.payouts[0].workerAmountCents).toBe(5400)
    expect(result.payouts[0].status).toBe('COMPLETED')
    expect(result.total).toBe(1)

    expect(mock.history.get[0].params.page).toBe(1)
  })

  it('defaults to page 1 when called with no argument', async () => {
    mock.onGet('/worker/payouts').reply(200, { payouts: [], total: 0, page: 1, limit: 20 })

    await payoutsApi.getPayouts()

    expect(mock.history.get[0].params.page).toBe(1)
  })
})
