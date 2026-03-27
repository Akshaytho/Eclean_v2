import { useActiveTaskStore } from '../../../src/stores/activeTaskStore'
import type { Task, GPSCoord } from '../../../src/types'

const NOW = Date.now()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1', title: 'Test Task', description: 'desc',
    category: 'DRAIN_CLEANING', dirtyLevel: 'MEDIUM', urgency: 'HIGH',
    rateCents: 6000, status: 'IN_PROGRESS', buyerId: 'b1', workerId: 'w1',
    locationLat: null, locationLng: null, locationAddress: null,
    workWindowStart: '', workWindowEnd: '', uploadWindowEnd: '',
    timezone: 'Asia/Kolkata', startedAt: null, submittedAt: null,
    completedAt: null, cancelledAt: null, timeSpentSecs: null,
    aiScore: null, aiReasoning: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  useActiveTaskStore.setState({ activeTask: null, gpsTrail: [], elapsedSecs: 0 })
})

describe('setActiveTask', () => {
  it('sets task and clears GPS trail', () => {
    useActiveTaskStore.getState().appendGPS({ lat: 1, lng: 1, timestamp: NOW })
    useActiveTaskStore.getState().setActiveTask(makeTask())
    expect(useActiveTaskStore.getState().activeTask?.id).toBe('task-1')
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(0)
  })

  it('computes elapsedSecs from startedAt when task starts', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    useActiveTaskStore.getState().setActiveTask(makeTask({ startedAt: fiveMinsAgo }))
    const { elapsedSecs } = useActiveTaskStore.getState()
    expect(elapsedSecs).toBeGreaterThanOrEqual(298)
    expect(elapsedSecs).toBeLessThanOrEqual(302)
  })

  it('sets elapsedSecs to 0 when no startedAt', () => {
    useActiveTaskStore.getState().setActiveTask(makeTask({ startedAt: null }))
    expect(useActiveTaskStore.getState().elapsedSecs).toBe(0)
  })

  it('sets activeTask to null on clearance', () => {
    useActiveTaskStore.getState().setActiveTask(makeTask())
    useActiveTaskStore.getState().setActiveTask(null)
    expect(useActiveTaskStore.getState().activeTask).toBeNull()
  })
})

describe('GPS trail', () => {
  it('appendGPS adds coords in order', () => {
    const { appendGPS } = useActiveTaskStore.getState()
    appendGPS({ lat: 17.385, lng: 78.486, timestamp: NOW })
    appendGPS({ lat: 17.386, lng: 78.487, timestamp: NOW + 1000 })
    appendGPS({ lat: 17.387, lng: 78.488, timestamp: NOW + 2000 })
    const trail = useActiveTaskStore.getState().gpsTrail
    expect(trail).toHaveLength(3)
    expect(trail[0].lat).toBe(17.385)
    expect(trail[2].lat).toBe(17.387)
  })

  it('clearGPSTrail empties the trail', () => {
    useActiveTaskStore.getState().appendGPS({ lat: 17.385, lng: 78.486, timestamp: NOW })
    useActiveTaskStore.getState().clearGPSTrail()
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(0)
  })

  it('appending two coords side by side works', () => {
    useActiveTaskStore.getState().appendGPS({ lat: 17.1, lng: 78.1, timestamp: NOW })
    useActiveTaskStore.getState().appendGPS({ lat: 17.2, lng: 78.2, timestamp: NOW + 1 })
    expect(useActiveTaskStore.getState().gpsTrail).toHaveLength(2)
  })
})

describe('setElapsedSecs', () => {
  it('updates elapsedSecs', () => {
    useActiveTaskStore.getState().setElapsedSecs(999)
    expect(useActiveTaskStore.getState().elapsedSecs).toBe(999)
  })
})
