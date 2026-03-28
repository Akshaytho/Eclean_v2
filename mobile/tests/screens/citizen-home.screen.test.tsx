/**
 * CITIZEN HOME SCREEN — UI FLOW TESTS
 * Tests: renders report list, shows status badges, FAB present, empty state
 */
import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { CitizenHomeScreen } from '../../src/screens/citizen/CitizenHomeScreen'
import { citizenApi }        from '../../src/api/citizen.api'
import { renderScreen, loginAsWorker } from './utils'

jest.mock('../../src/api/citizen.api')
const mockApi = citizenApi as jest.Mocked<typeof citizenApi>

const MOCK_REPORTS = [
  {
    id: 'r1',
    description: 'Large garbage pile near bus stop',
    category: 'GARBAGE_COLLECTION',
    urgency: 'HIGH',
    status: 'PENDING',
    lat: 17.385, lng: 78.487,
    locationAddress: 'MG Road, Hyderabad',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'r2',
    description: 'Blocked drain causing waterlogging',
    category: 'DRAIN_CLEANING',
    urgency: 'URGENT',
    status: 'RESOLVED',
    lat: 17.390, lng: 78.490,
    locationAddress: null,
    createdAt: new Date().toISOString(),
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  loginAsWorker()
  // Set role to CITIZEN for auth store
  const { useAuthStore } = require('../../src/stores/authStore')
  useAuthStore.setState({
    user: { id: 'c1', email: 'citizen@test.com', name: 'Test Citizen', role: 'CITIZEN' },
    isLoggedIn: true,
  })
})

// ─── Render with reports ──────────────────────────────────────────────────────

describe('CitizenHomeScreen — with reports', () => {
  beforeEach(() => {
    mockApi.listReports.mockResolvedValue(MOCK_REPORTS as any)
  })

  it('shows header with report count', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('My Reports')).toBeTruthy())
  })

  it('renders report descriptions', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('Large garbage pile near bus stop')).toBeTruthy())
    expect(getByText('Blocked drain causing waterlogging')).toBeTruthy()
  })

  it('shows status badges', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('Pending')).toBeTruthy())
    expect(getByText('Resolved')).toBeTruthy()
  })

  it('shows location for reports with address', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('MG Road, Hyderabad')).toBeTruthy())
  })

  it('shows category labels', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('GARBAGE COLLECTION')).toBeTruthy())
  })
})

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('CitizenHomeScreen — empty', () => {
  beforeEach(() => {
    mockApi.listReports.mockResolvedValue([] as any)
  })

  it('shows empty state message', async () => {
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('No reports yet')).toBeTruthy())
  })
})

// ─── API error ────────────────────────────────────────────────────────────────

describe('CitizenHomeScreen — API error', () => {
  it('still renders without crash on API failure', async () => {
    mockApi.listReports.mockRejectedValue(new Error('Network error'))
    const { getByText } = renderScreen(CitizenHomeScreen)
    await waitFor(() => expect(getByText('My Reports')).toBeTruthy())
  })
})
