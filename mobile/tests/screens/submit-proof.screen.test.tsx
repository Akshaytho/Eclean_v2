/**
 * SUBMIT PROOF SCREEN — UI FLOW TESTS
 * Labels render as "Before Photo" / "After Photo" / "Proof Photo"
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { SubmitProofScreen } from '../../src/screens/worker/SubmitProofScreen'
import { workerTasksApi } from '../../src/api/tasks.api'
import { mediaApi }       from '../../src/api/media.api'
import { useActiveTaskStore } from '../../src/stores/activeTaskStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Task, TaskMedia } from '../../src/types'

jest.mock('../../src/api/tasks.api')
jest.mock('../../src/api/media.api')
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}))

const mockTaskApi  = workerTasksApi as jest.Mocked<typeof workerTasksApi>
const mockMediaApi = mediaApi       as jest.Mocked<typeof mediaApi>

const mockGoBack   = jest.fn()
const mockPopToTop = jest.fn()
// SubmitProofScreen uses useNavigation/useRoute hooks internally
jest.mock('@react-navigation/native', () => ({
  useNavigation:  () => ({ goBack: mockGoBack, popToTop: mockPopToTop, navigate: jest.fn() }),
  useRoute:       () => ({ params: { taskId: 'task-1' } }),
  useFocusEffect: jest.fn(),
  NavigationContainer: ({ children }: any) => children,
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', title: 'Clean MG Road Drain', description: 'desc',
    category: 'DRAIN_CLEANING', dirtyLevel: 'HEAVY', urgency: 'HIGH',
    rateCents: 6000, status: 'IN_PROGRESS', buyerId: 'buyer-1', workerId: 'worker-1',
    locationLat: 17.385, locationLng: 78.4867, locationAddress: 'MG Road',
    workWindowStart: '2026-03-27T06:00:00Z', workWindowEnd: '2026-03-27T18:00:00Z',
    uploadWindowEnd: '2026-03-27T19:00:00Z', timezone: 'Asia/Kolkata',
    startedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    submittedAt: null, completedAt: null, cancelledAt: null,
    timeSpentSecs: null, aiScore: null, aiReasoning: null,
    createdAt: '2026-03-27T05:00:00Z', updatedAt: '2026-03-27T05:00:00Z',
    ...overrides,
  }
}

function makeMedia(type: TaskMedia['type']): TaskMedia {
  return {
    id: `m-${type}`, taskId: 'task-1', type,
    url: `https://cdn.test/${type}.jpg`,
    publicId: null, mimeType: 'image/jpeg', sizeBytes: 50000, createdAt: '',
  }
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(Alert.alert as jest.Mock).mockClear()
  useActiveTaskStore.setState({ activeTask: null, gpsTrail: [], elapsedSecs: 1800 })
})

// ─── Render ───────────────────────────────────────────────────────────────────

describe('SubmitProofScreen — initial render', () => {
  it('shows screen title and task name', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Review & Submit')).toBeTruthy())
    expect(getByText('Clean MG Road Drain')).toBeTruthy()
  })

  // Labels in the real screen are "{label} Photo" e.g. "Before Photo"
  it('shows Before Photo, After Photo, Proof Photo labels', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => {
      expect(getByText('Before Photo')).toBeTruthy()
      expect(getByText('After Photo')).toBeTruthy()
      expect(getByText('Proof Photo')).toBeTruthy()
    })
  })

  it('shows "Not uploaded" when no photos exist', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getAllByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getAllByText('Not uploaded').length).toBe(3))
  })

  it('shows Submit Work button', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Submit Work')).toBeTruthy())
  })
})

// ─── With photos uploaded ─────────────────────────────────────────────────────

describe('SubmitProofScreen — uploaded photos display', () => {
  it('shows Uploaded status when all 3 photos present', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([
      makeMedia('BEFORE'), makeMedia('AFTER'), makeMedia('PROOF'),
    ])
    const { getAllByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getAllByText('Uploaded').length).toBe(3))
  })

  it('shows mixed state when only BEFORE is uploaded', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([makeMedia('BEFORE')])
    const { getAllByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => {
      expect(getAllByText('Uploaded').length).toBe(1)
      expect(getAllByText('Missing — go back to upload').length).toBe(2)
    })
  })
})

// ─── Submit flow ──────────────────────────────────────────────────────────────

describe('SubmitProofScreen — submit flow', () => {
  it('shows confirmation dialog when Submit Work tapped', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Submit Work')).toBeTruthy())
    fireEvent.press(getByText('Submit Work'))
    expect(Alert.alert).toHaveBeenCalledWith('Submit Work', expect.any(String), expect.any(Array))
  })

  it('calls workerTasksApi.submit with correct taskId after confirming', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([makeMedia('BEFORE'), makeMedia('AFTER'), makeMedia('PROOF')])
    mockTaskApi.submit.mockResolvedValue(makeTask({ status: 'SUBMITTED' }))

    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Submit Work')).toBeTruthy())
    fireEvent.press(getByText('Submit Work'))

    const call       = (Alert.alert as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'Submit Work')
    const confirmBtn = call[2].find((b: any) => b.text === 'Submit Now')
    await act(async () => { confirmBtn.onPress() })

    await waitFor(() => expect(mockTaskApi.submit).toHaveBeenCalledWith('task-1'))
  })

  it('double-tap prevention — second press is ignored while API in flight', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    mockTaskApi.submit.mockReturnValue(new Promise(() => {})) // never resolves

    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Submit Work')).toBeTruthy())
    fireEvent.press(getByText('Submit Work'))

    const call       = (Alert.alert as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'Submit Work')
    const confirmBtn = call[2].find((b: any) => b.text === 'Submit Now')
    await act(async () => { confirmBtn.onPress() })

    // Second press — should not trigger another API call
    fireEvent.press(getByText('Submit Work'))
    expect(mockTaskApi.submit).toHaveBeenCalledTimes(1)
  })

  it('shows success alert after submit completes', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([makeMedia('BEFORE'), makeMedia('AFTER'), makeMedia('PROOF')])
    mockTaskApi.submit.mockResolvedValue(makeTask({ status: 'SUBMITTED' }))

    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Submit Work')).toBeTruthy())
    fireEvent.press(getByText('Submit Work'))

    const call       = (Alert.alert as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'Submit Work')
    const confirmBtn = call[2].find((b: any) => b.text === 'Submit Now')
    await act(async () => { confirmBtn.onPress() })

    await waitFor(() => {
      const success = (Alert.alert as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'Submitted!')
      expect(success).toBeTruthy()
    })
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('SubmitProofScreen — navigation', () => {
  it('calls goBack when Go Back is pressed', async () => {
    mockTaskApi.getTask.mockResolvedValue(makeTask())
    mockMediaApi.list.mockResolvedValue([])
    const { getByText } = wrap(<SubmitProofScreen />)
    await waitFor(() => expect(getByText('Go Back')).toBeTruthy())
    fireEvent.press(getByText('Go Back'))
    expect(mockGoBack).toHaveBeenCalled()
  })
})
