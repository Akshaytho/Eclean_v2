/**
 * SUPERVISOR HOME SCREEN — UI FLOW TESTS
 * Tests: zone list renders, dirty levels shown, empty state, summary pills
 */
import React from 'react'
import { waitFor, screen } from '@testing-library/react-native'
import { SupervisorHomeScreen } from '../../src/screens/supervisor/SupervisorHomeScreen'
import { zonesApi }             from '../../src/api/zones.api'
import { renderScreen }         from './utils'

jest.mock('../../src/api/zones.api')
const mockApi = zonesApi as jest.Mocked<typeof zonesApi>

const MOCK_ZONES = [
  {
    id: 'z1', name: 'Begumpet Zone A', city: 'Hyderabad',
    dirtyLevel: 'HEAVY', lat: 17.44, lng: 78.47, radiusMeters: 500,
    lastInspectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    supervisorId: 'sup1', createdAt: new Date().toISOString(),
  },
  {
    id: 'z2', name: 'Ameerpet Zone B', city: 'Hyderabad',
    dirtyLevel: 'LIGHT', lat: 17.43, lng: 78.44, radiusMeters: 300,
    lastInspectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    supervisorId: 'sup1', createdAt: new Date().toISOString(),
  },
  {
    id: 'z3', name: 'Kukatpally Zone C', city: 'Hyderabad',
    dirtyLevel: null, lat: 17.49, lng: 78.40, radiusMeters: 400,
    lastInspectedAt: null,
    supervisorId: 'sup1', createdAt: new Date().toISOString(),
  },
]

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Zone list ────────────────────────────────────────────────────────────────

describe('SupervisorHomeScreen — with zones', () => {
  beforeEach(() => {
    mockApi.list.mockResolvedValue(MOCK_ZONES as any)
  })

  it('shows zones header', async () => {
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText('Zones')).toBeTruthy())
  })

  it('renders zone names', async () => {
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText('Begumpet Zone A')).toBeTruthy())
    expect(getByText('Ameerpet Zone B')).toBeTruthy()
    expect(getByText('Kukatpally Zone C')).toBeTruthy()
  })

  it('shows dirty level badges', async () => {
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect((screen.getAllByText('Heavy')).length).toBeGreaterThan(0))
    expect(screen.getAllByText('Light').length).toBeGreaterThan(0)
  })

  it('shows "needs attention" in subtitle for heavy zones', async () => {
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText(/need attention/i)).toBeTruthy())
  })

  it('shows never inspected for zone without lastInspectedAt', async () => {
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText('Never inspected')).toBeTruthy())
  })
})

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('SupervisorHomeScreen — empty', () => {
  it('shows no zones assigned message', async () => {
    mockApi.list.mockResolvedValue([])
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText('No zones assigned')).toBeTruthy())
  })
})

// ─── API error ────────────────────────────────────────────────────────────────

describe('SupervisorHomeScreen — error', () => {
  it('renders without crash on API failure', async () => {
    mockApi.list.mockRejectedValue(new Error('Server error'))
    const { getByText } = renderScreen(SupervisorHomeScreen)
    await waitFor(() => expect(getByText('Zones')).toBeTruthy())
  })
})
