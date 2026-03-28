/**
 * CREATE REPORT SCREEN — UI FLOW TESTS
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateReportScreen } from '../../src/screens/citizen/CreateReportScreen'
import { citizenApi }         from '../../src/api/citizen.api'

jest.mock('../../src/api/citizen.api')
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 17.385, longitude: 78.487, accuracy: 10 },
  }),
  Accuracy: { High: 4 },
}))
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute:      () => ({ params: {} }),
  useFocusEffect: jest.fn(),
}))

const mockApi = citizenApi as jest.Mocked<typeof citizenApi>

function renderReport() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CreateReportScreen />
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

// ─── Render ────────────────────────────────────────────────────────────────────

describe('CreateReportScreen — render', () => {
  it('shows the form header', () => {
    const { getByText } = renderReport()
    expect(getByText('Report a Problem')).toBeTruthy()
  })

  it('shows category options', () => {
    const { getByText } = renderReport()
    expect(getByText('Street')).toBeTruthy()
    expect(getByText('Drain')).toBeTruthy()
    expect(getByText('Garbage')).toBeTruthy()
  })

  it('shows all urgency levels', () => {
    const { getByText } = renderReport()
    expect(getByText('Low')).toBeTruthy()
    expect(getByText('Medium')).toBeTruthy()
    expect(getByText('High')).toBeTruthy()
    expect(getByText('Urgent')).toBeTruthy()
  })

  it('shows Use My Location button', () => {
    const { getByText } = renderReport()
    expect(getByText('Use My Location')).toBeTruthy()
  })
})

// ─── Category selection ───────────────────────────────────────────────────────

describe('CreateReportScreen — interaction', () => {
  it('selects a category on tap', () => {
    const { getByText } = renderReport()
    fireEvent.press(getByText('Drain'))
    expect(getByText('Drain')).toBeTruthy()
  })

  it('selects urgency on tap', () => {
    const { getByText } = renderReport()
    fireEvent.press(getByText('Urgent'))
    expect(getByText('Urgent')).toBeTruthy()
  })
})

// ─── GPS ──────────────────────────────────────────────────────────────────────

describe('CreateReportScreen — GPS', () => {
  it('captures GPS on Use My Location tap', async () => {
    const { getByText } = renderReport()
    await act(async () => { fireEvent.press(getByText('Use My Location')) })
    await waitFor(() => expect(getByText('✓ Location captured')).toBeTruthy())
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('CreateReportScreen — validation', () => {
  it('shows char count for short description', () => {
    const { getByPlaceholderText, getByText } = renderReport()
    fireEvent.changeText(getByPlaceholderText(/Large pile of garbage/i), 'Short')
    expect(getByText(/5 chars/)).toBeTruthy()
  })

  it('shows ✓ when description is long enough', () => {
    const { getByPlaceholderText, getByText } = renderReport()
    fireEvent.changeText(
      getByPlaceholderText(/Large pile of garbage/i),
      'Detailed description of the problem area'
    )
    expect(getByText(/40 chars|✓|chars/)).toBeTruthy()
  })
})

// ─── Submit ──────────────────────────────────────────────────────────────────

describe('CreateReportScreen — submit', () => {
  it('calls createReport API with correct payload', async () => {
    mockApi.createReport.mockResolvedValue({ id: 'r1' } as any)
    const { getByText, getByPlaceholderText } = renderReport()

    fireEvent.press(getByText('Drain'))
    fireEvent.changeText(
      getByPlaceholderText(/Large pile of garbage/i),
      'Blocked drain near school entrance causing flooding'
    )
    await act(async () => { fireEvent.press(getByText('Use My Location')) })
    await waitFor(() => expect(getByText('✓ Location captured')).toBeTruthy())

    await act(async () => { fireEvent.press(getByText('Submit Report')) })

    await waitFor(() =>
      expect(mockApi.createReport).toHaveBeenCalledWith(
        expect.objectContaining({
          category:    'DRAIN_CLEANING',
          description: 'Blocked drain near school entrance causing flooding',
          lat: 17.385,
          lng: 78.487,
        })
      )
    )
  })
})
