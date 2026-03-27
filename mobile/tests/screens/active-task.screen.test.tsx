/**
 * ACTIVE TASK SCREEN — UI FLOW TESTS
 * ActiveTaskScreen uses useNavigation/useRoute hooks
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { ActiveTaskScreen } from '../../src/screens/worker/ActiveTaskScreen'
import { workerTasksApi }   from '../../src/api/tasks.api'
import { useActiveTaskStore } from '../../src/stores/activeTaskStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Task } from '../../src/types'

jest.mock('../../src/api/tasks.api')
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}))
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestCameraPermissionsAsync:       jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchCameraAsync:       jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: 'Images' },
}))

// Provide currentLocation so handleStart doesn't bail out early
jest.mock('../../src/hooks/useBackgroundLocation', () => ({
  useBackgroundLocation: () => ({
    currentLocation:    { lat: 17.385, lng: 78.4867, accuracy: 5, timestamp: 1000 },
    isTracking:         false,
    hasPermission:      true,
    requestPermissions: jest.fn().mockResolvedValue(true),
    startTracking:      jest.fn().mockResolvedValue(true),
    stopTracking:       jest.fn().mockResolvedValue(undefined),
  }),
}))

const mockApi      = workerTasksApi as jest.Mocked<typeof workerTasksApi>
const mockNavigate = jest.fn()

// ActiveTaskScreen uses hooks
jest.mock('@react-navigation/native', () => ({
  useNavigation:   () => ({ navigate: mockNavigate, goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn() }),
  useRoute:        () => ({ params: { taskId: 'task-1' } }),
  useFocusEffect:  jest.fn(),
  NavigationContainer: ({ children }: any) => children,
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', title: 'Clean MG Road Drain', description: 'desc',
    category: 'DRAIN_CLEANING', dirtyLevel: 'HEAVY', urgency: 'HIGH',
    rateCents: 6000, status: 'ACCEPTED', buyerId: 'buyer-1', workerId: 'worker-1',
    locationLat: 17.385, locationLng: 78.4867, locationAddress: 'MG Road',
    workWindowStart: '2026-03-27T06:00:00Z', workWindowEnd: '2026-03-27T18:00:00Z',
    uploadWindowEnd: '2026-03-27T19:00:00Z', timezone: 'Asia/Kolkata',
    startedAt: null, submittedAt: null, completedAt: null, cancelledAt: null,
    timeSpentSecs: null, aiScore: null, aiReasoning: null,
    createdAt: '2026-03-27T05:00:00Z', updatedAt: '2026-03-27T05:00:00Z',
    media: [],
    ...overrides,
  }
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(Alert.alert as jest.Mock).mockClear()
  useActiveTaskStore.setState({ activeTask: null, gpsTrail: [], elapsedSecs: 0 })
})

// ─── ACCEPTED state ───────────────────────────────────────────────────────────

describe('ActiveTaskScreen — ACCEPTED state', () => {
  it('shows task title and price', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText('Clean MG Road Drain')).toBeTruthy())
    expect(getByText('₹60')).toBeTruthy()
  })

  it('shows Start Work button', async () => {
    mockApi.getTask.mockResolvedValue(makeTask({ status: 'ACCEPTED' }))
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText('Start Work')).toBeTruthy())
  })

  it('does NOT show photo grid when ACCEPTED', async () => {
    mockApi.getTask.mockResolvedValue(makeTask({ status: 'ACCEPTED' }))
    const { queryByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(queryByText('Upload Photos')).toBeNull())
  })

  it('shows Cancel button', async () => {
    mockApi.getTask.mockResolvedValue(makeTask({ status: 'ACCEPTED' }))
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText(/Cancel/)).toBeTruthy())
  })
})

// ─── Start Work ───────────────────────────────────────────────────────────────

describe('ActiveTaskScreen — Start Work flow', () => {
  it('calls workerTasksApi.start with taskId and GPS coords', async () => {
    const inProgressTask = makeTask({ status: 'IN_PROGRESS', startedAt: new Date().toISOString() })
    mockApi.getTask
      .mockResolvedValueOnce(makeTask({ status: 'ACCEPTED' }))
      .mockResolvedValue(inProgressTask)
    mockApi.start.mockResolvedValue(inProgressTask)

    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText('Start Work')).toBeTruthy())
    await act(async () => { fireEvent.press(getByText('Start Work')) })

    await waitFor(() => expect(mockApi.start).toHaveBeenCalledTimes(1))
    expect(mockApi.start).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ lat: 17.385, lng: 78.4867 }),
    )
  })

  it('syncs IN_PROGRESS task into activeTaskStore after start', async () => {
    const startedAt      = new Date().toISOString()
    const inProgressTask = makeTask({ status: 'IN_PROGRESS', startedAt })
    mockApi.getTask
      .mockResolvedValueOnce(makeTask({ status: 'ACCEPTED' }))
      .mockResolvedValue(inProgressTask)
    mockApi.start.mockResolvedValue(inProgressTask)

    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText('Start Work')).toBeTruthy())
    await act(async () => { fireEvent.press(getByText('Start Work')) })

    await waitFor(() =>
      expect(useActiveTaskStore.getState().activeTask?.status).toBe('IN_PROGRESS'),
    )
  })
})

// ─── IN_PROGRESS photo grid ───────────────────────────────────────────────────

describe('ActiveTaskScreen — IN_PROGRESS photo grid', () => {
  it('shows Before, After, Proof slots', async () => {
    mockApi.getTask.mockResolvedValue(
      makeTask({ status: 'IN_PROGRESS', startedAt: new Date().toISOString() }),
    )
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => {
      expect(getByText('Before')).toBeTruthy()
      expect(getByText('After')).toBeTruthy()
      expect(getByText('Proof')).toBeTruthy()
    })
  })

  it('shows Photos: 0/3 when no photos uploaded', async () => {
    mockApi.getTask.mockResolvedValue(
      makeTask({ status: 'IN_PROGRESS', startedAt: new Date().toISOString() }),
    )
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText(/Photos: 0\/3/)).toBeTruthy())
  })

  it('navigates to SubmitProof when photo button tapped', async () => {
    mockApi.getTask.mockResolvedValue(
      makeTask({ status: 'IN_PROGRESS', startedAt: new Date().toISOString() }),
    )
    const { getByText } = wrap(<ActiveTaskScreen />)
    await waitFor(() => expect(getByText(/Photos:/)).toBeTruthy())
    fireEvent.press(getByText(/Photos:/))
    expect(mockNavigate).toHaveBeenCalledWith('SubmitProof', { taskId: 'task-1' })
  })
})

// ─── GPS store (pure store, no render needed) ─────────────────────────────────

describe('ActiveTaskStore — GPS trail and timer', () => {
  it('appending GPS coords accumulates in order', () => {
    const { appendGPS } = useActiveTaskStore.getState()
    appendGPS({ lat: 17.385, lng: 78.486, accuracy: 5, timestamp: 1000 })
    appendGPS({ lat: 17.386, lng: 78.487, accuracy: 4, timestamp: 2000 })
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(2)
    expect(useActiveTaskStore.getState().gpsTrail[1].lat).toBe(17.386)
  })

  it('timer is computed from server startedAt — not local clock', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    useActiveTaskStore.getState().setActiveTask(
      makeTask({ status: 'IN_PROGRESS', startedAt: fiveMinsAgo }),
    )
    expect(useActiveTaskStore.getState().elapsedSecs).toBeGreaterThanOrEqual(298)
    expect(useActiveTaskStore.getState().elapsedSecs).toBeLessThanOrEqual(302)
  })

  it('clearGPSTrail resets to empty', () => {
    useActiveTaskStore.getState().appendGPS({ lat: 17.385, lng: 78.486, accuracy: 5, timestamp: 1 })
    useActiveTaskStore.getState().clearGPSTrail()
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(0)
  })
})
