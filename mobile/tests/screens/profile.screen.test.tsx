/**
 * PROFILE SCREEN — UI FLOW TESTS
 * Tests: renders for each role, shows real stats, logout flow
 */
import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { ProfileScreen }  from '../../src/screens/shared/ProfileScreen'
import { authApi }        from '../../src/api/auth.api'
import { renderScreen, loginAsWorker, loginAsBuyer } from './utils'

jest.mock('../../src/api/auth.api')
jest.mock('../../src/stores/socketStore', () => ({
  useSocketStore: () => ({ disconnect: jest.fn() }),
}))

const mockApi = authApi as jest.Mocked<typeof authApi>

const WORKER_PROFILE = {
  id: 'w1', email: 'worker@eclean.test', name: 'Ravi Kumar', role: 'WORKER' as const,
  workerProfile: { completedTasks: 12, rating: 4.3, isAvailable: true, identityVerified: true },
}

const BUYER_PROFILE = {
  id: 'b1', email: 'buyer@eclean.test', name: 'Priya Sharma', role: 'BUYER' as const,
  buyerProfile: { totalTasksPosted: 5, totalSpentCents: 36000 },
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Worker profile ───────────────────────────────────────────────────────────

describe('ProfileScreen — Worker', () => {
  beforeEach(() => {
    loginAsWorker({ name: 'Ravi Kumar' })
    mockApi.me.mockResolvedValue(WORKER_PROFILE as any)
  })

  it('shows worker name and role badge', async () => {
    const { getAllByText, getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getAllByText('Ravi Kumar').length).toBeGreaterThan(0))
    expect(getAllByText('Field Worker').length).toBeGreaterThan(0)
  })

  it('shows completed tasks stat', async () => {
    const { getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getByText('12')).toBeTruthy())
    expect(getByText('Completed')).toBeTruthy()
  })

  it('shows rating stat', async () => {
    const { getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getByText('4.3★')).toBeTruthy())
  })

  it('shows account info section', async () => {
    const { getAllByText, getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getAllByText('Ravi Kumar').length).toBeGreaterThan(0))
    expect(getByText('Account')).toBeTruthy()
    expect(getByText('Full Name')).toBeTruthy()
    expect(getByText('Email')).toBeTruthy()
  })

  it('shows sign out button', async () => {
    const { getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getByText('Sign Out')).toBeTruthy())
  })
})

// ─── Buyer profile ────────────────────────────────────────────────────────────

describe('ProfileScreen — Buyer', () => {
  beforeEach(() => {
    loginAsBuyer({ name: 'Priya Sharma' })
    mockApi.me.mockResolvedValue(BUYER_PROFILE as any)
  })

  it('shows buyer name and role badge', async () => {
    const { getAllByText, getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getAllByText('Priya Sharma').length).toBeGreaterThan(0))
    expect(getAllByText('Task Buyer').length).toBeGreaterThan(0)
  })

  it('shows tasks posted stat', async () => {
    const { getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getByText('5')).toBeTruthy())
    expect(getByText('Tasks Posted')).toBeTruthy()
  })

  it('shows total spent stat', async () => {
    const { getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getByText('Total Spent')).toBeTruthy())
  })
})

// ─── Loading state ────────────────────────────────────────────────────────────

describe('ProfileScreen — loading', () => {
  it('renders skeleton while loading', () => {
    loginAsWorker()
    mockApi.me.mockReturnValue(new Promise(() => {})) // never resolves
    const { getAllByText } = renderScreen(ProfileScreen)
    // Name should still show from auth store
    expect(getAllByText('Test Worker').length).toBeGreaterThan(0)
  })
})

// ─── API error ────────────────────────────────────────────────────────────────

describe('ProfileScreen — API error', () => {
  it('still renders with auth store data when API fails', async () => {
    loginAsWorker()
    mockApi.me.mockRejectedValue(new Error('Network error'))
    const { getAllByText, getByText } = renderScreen(ProfileScreen)
    await waitFor(() => expect(getAllByText('Test Worker').length).toBeGreaterThan(0))
    expect(getByText('Sign Out')).toBeTruthy()
  })
})
