/**
 * Unit tests for activeTaskStore.ts
 * Verifies GPS trail management and the server-timestamp-based elapsed timer.
 */
import { useActiveTaskStore } from '../../../src/stores/activeTaskStore'
import type { Task } from '../../../src/types'

beforeEach(() => {
  useActiveTaskStore.setState({ activeTask: null, gpsTrail: [], elapsedSecs: 0 })
})

const baseTask: Task = {
  id: 'task-1',
  title: 'Clean Juhu Beach',
  description: 'Test',
  category: 'STREET_CLEANING',
  dirtyLevel: 'MEDIUM',
  urgency: 'HIGH',
  rateCents: 6000,
  status: 'IN_PROGRESS',
  buyerId: 'buyer-1',
  workerId: 'worker-1',
  locationLat: 19.097,
  locationLng: 72.827,
  locationAddress: null,
  workWindowStart: '2026-03-27T06:00:00.000Z',
  workWindowEnd: '2026-03-27T10:00:00.000Z',
  uploadWindowEnd: '2026-03-27T11:00:00.000Z',
  timezone: 'Asia/Kolkata',
  startedAt: null,
  submittedAt: null,
  completedAt: null,
  cancelledAt: null,
  timeSpentSecs: null,
  aiScore: null,
  aiReasoning: null,
  createdAt: '2026-03-27T05:00:00.000Z',
  updatedAt: '2026-03-27T07:00:00.000Z',
}

describe('setActiveTask', () => {
  it('stores the task and resets GPS trail', () => {
    // Pre-populate trail to verify it resets
    useActiveTaskStore.setState({ gpsTrail: [{ lat: 1, lng: 1 }] })

    useActiveTaskStore.getState().setActiveTask(baseTask)

    const state = useActiveTaskStore.getState()
    expect(state.activeTask?.id).toBe('task-1')
    expect(state.gpsTrail).toHaveLength(0)
  })

  it('computes elapsedSecs from task.startedAt (survives restarts)', () => {
    // Task started 5 minutes ago
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const startedTask = { ...baseTask, startedAt: fiveMinAgo }

    useActiveTaskStore.getState().setActiveTask(startedTask)

    const { elapsedSecs } = useActiveTaskStore.getState()
    // Should be ~300s ± 2s tolerance
    expect(elapsedSecs).toBeGreaterThanOrEqual(298)
    expect(elapsedSecs).toBeLessThanOrEqual(302)
  })

  it('sets elapsedSecs to 0 when task has no startedAt (ACCEPTED state)', () => {
    useActiveTaskStore.getState().setActiveTask({ ...baseTask, status: 'ACCEPTED', startedAt: null })

    expect(useActiveTaskStore.getState().elapsedSecs).toBe(0)
  })

  it('clears task when called with null', () => {
    useActiveTaskStore.getState().setActiveTask(baseTask)
    useActiveTaskStore.getState().setActiveTask(null)

    expect(useActiveTaskStore.getState().activeTask).toBeNull()
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(0)
  })
})

describe('appendGPS', () => {
  it('adds GPS points to the trail in order', () => {
    const { appendGPS } = useActiveTaskStore.getState()

    appendGPS({ lat: 19.097, lng: 72.827 })
    appendGPS({ lat: 19.098, lng: 72.828 })
    appendGPS({ lat: 19.099, lng: 72.829 })

    const { gpsTrail } = useActiveTaskStore.getState()
    expect(gpsTrail).toHaveLength(3)
    expect(gpsTrail[0].lat).toBe(19.097)
    expect(gpsTrail[2].lat).toBe(19.099)
  })
})

describe('clearGPSTrail', () => {
  it('empties the GPS trail', () => {
    useActiveTaskStore.setState({ gpsTrail: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }] })

    useActiveTaskStore.getState().clearGPSTrail()

    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(0)
  })
})

describe('setElapsedSecs', () => {
  it('updates the elapsed seconds counter', () => {
    useActiveTaskStore.getState().setElapsedSecs(330)

    expect(useActiveTaskStore.getState().elapsedSecs).toBe(330)
  })
})
