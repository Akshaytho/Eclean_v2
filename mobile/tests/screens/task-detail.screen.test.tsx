/**
 * TASK DETAIL SCREEN — UI FLOW TESTS
 * TaskDetailScreen uses useNavigation/useRoute hooks (not props)
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { TaskDetailScreen } from '../../src/screens/worker/TaskDetailScreen'
import { workerTasksApi }   from '../../src/api/tasks.api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Task } from '../../src/types'

jest.mock('../../src/api/tasks.api')
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}))

const mockApi     = workerTasksApi as jest.Mocked<typeof workerTasksApi>
const mockReplace = jest.fn()
const mockGoBack  = jest.fn()

// TaskDetailScreen uses hooks — mock them here
jest.mock('@react-navigation/native', () => ({
  useNavigation:   () => ({ replace: mockReplace, goBack: mockGoBack, navigate: jest.fn() }),
  useRoute:        () => ({ params: { taskId: 'task-1' } }),
  useFocusEffect:  jest.fn(),
  NavigationContainer: ({ children }: any) => children,
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', title: 'Clean MG Road Drain', description: 'Blocked drain near bus stop',
    category: 'DRAIN_CLEANING', dirtyLevel: 'HEAVY', urgency: 'HIGH',
    rateCents: 6000, status: 'OPEN', buyerId: 'buyer-1', workerId: null,
    locationLat: 17.385, locationLng: 78.4867, locationAddress: 'MG Road, Hyderabad',
    workWindowStart: '2026-03-27T06:00:00Z', workWindowEnd: '2026-03-27T18:00:00Z',
    uploadWindowEnd: '2026-03-27T19:00:00Z', timezone: 'Asia/Kolkata',
    startedAt: null, submittedAt: null, completedAt: null, cancelledAt: null,
    timeSpentSecs: null, aiScore: null, aiReasoning: null,
    createdAt: '2026-03-27T05:00:00Z', updatedAt: '2026-03-27T05:00:00Z',
    ...overrides,
  }
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

async function pressAcceptAndConfirm() {
  const calls      = (Alert.alert as jest.Mock).mock.calls
  const acceptCall = calls.find((c: any[]) => c[0] === 'Accept Task')
  if (!acceptCall) throw new Error('Accept Task alert not shown')
  const btn = acceptCall[2].find((b: any) => b.text === 'Accept')
  await act(async () => { btn.onPress() })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(Alert.alert as jest.Mock).mockClear()
})

// ─── Loading ──────────────────────────────────────────────────────────────────

describe('TaskDetailScreen — loading state', () => {
  it('shows spinner while fetching', () => {
    mockApi.getTask.mockReturnValue(new Promise(() => {}))
    const { getByTestId } = wrap(<TaskDetailScreen />)
    expect(getByTestId('ActivityIndicator')).toBeTruthy()
  })
})

// ─── Display ──────────────────────────────────────────────────────────────────

describe('TaskDetailScreen — task data displayed', () => {
  it('shows title, price, and description', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText('Clean MG Road Drain')).toBeTruthy())
    expect(getByText('₹60')).toBeTruthy()
    expect(getByText('Blocked drain near bus stop')).toBeTruthy()
  })

  it('shows Accept button for OPEN tasks', async () => {
    mockApi.getTask.mockResolvedValue(makeTask({ status: 'OPEN' }))
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
  })

  it('hides Accept button for ACCEPTED tasks', async () => {
    mockApi.getTask.mockResolvedValue(makeTask({ status: 'ACCEPTED', workerId: 'w1' }))
    const { queryByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(queryByText(/Accept/)).toBeNull())
  })
})

// ─── Accept flow ──────────────────────────────────────────────────────────────

describe('TaskDetailScreen — accept flow', () => {
  it('shows confirmation dialog when Accept tapped', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    expect(Alert.alert).toHaveBeenCalledWith('Accept Task', expect.any(String), expect.any(Array))
  })

  it('calls workerTasksApi.accept with taskId after confirming', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    mockApi.accept.mockResolvedValue(makeTask({ status: 'ACCEPTED', workerId: 'w1' }))
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    await pressAcceptAndConfirm()
    await waitFor(() => expect(mockApi.accept).toHaveBeenCalledWith('task-1'))
  })

  it('navigates to ActiveTask after successful accept', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    mockApi.accept.mockResolvedValue(makeTask({ status: 'ACCEPTED', workerId: 'w1' }))
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    await pressAcceptAndConfirm()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('ActiveTask', { taskId: 'task-1' }))
  })

  it('blocks double-tap — second press ignored while in flight', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    mockApi.accept.mockResolvedValue(makeTask({ status: 'ACCEPTED', workerId: 'w1' }))
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    await pressAcceptAndConfirm()
    fireEvent.press(getByText(/Accept/))
    await waitFor(() => expect(mockApi.accept).toHaveBeenCalledTimes(1))
  })
})

// ─── Error handling ───────────────────────────────────────────────────────────

describe('TaskDetailScreen — accept errors', () => {
  it('shows error alert on API failure', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    mockApi.accept.mockRejectedValue({
      response: { data: { error: { message: 'Task no longer available' } } },
    })
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    await pressAcceptAndConfirm()
    await waitFor(() => {
      const lastAlert = (Alert.alert as jest.Mock).mock.calls.at(-1)
      expect(lastAlert[1]).toContain('Task no longer available')
    })
  })

  it('does NOT navigate on error', async () => {
    mockApi.getTask.mockResolvedValue(makeTask())
    mockApi.accept.mockRejectedValue({ response: { data: { error: { message: 'Error' } } } })
    const { getByText } = wrap(<TaskDetailScreen />)
    await waitFor(() => expect(getByText(/Accept/)).toBeTruthy())
    fireEvent.press(getByText(/Accept/))
    await pressAcceptAndConfirm()
    await waitFor(() => expect((Alert.alert as jest.Mock).mock.calls.length).toBeGreaterThan(1))
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
