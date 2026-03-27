/**
 * Unit tests for tasks.api.ts (worker + buyer)
 * Verifies endpoint paths, request bodies, and response unwrapping.
 */
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '../../../src/api/client'
import { workerTasksApi, buyerTasksApi } from '../../../src/api/tasks.api'
import type { Task } from '../../../src/types'

const mock = new MockAdapter(apiClient, { onNoMatch: 'throwException' })

afterEach(() => mock.reset())
afterAll(() => mock.restore())

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockTask: Task = {
  id: 'task-1',
  title: 'Clean Juhu Beach',
  description: 'Collect trash along 200m stretch',
  category: 'STREET_CLEANING',
  dirtyLevel: 'MEDIUM',
  urgency: 'HIGH',
  rateCents: 6000,
  status: 'OPEN',
  buyerId: 'buyer-1',
  workerId: null,
  locationLat: 19.097,
  locationLng: 72.827,
  locationAddress: 'Juhu Beach, Mumbai',
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
  updatedAt: '2026-03-27T05:00:00.000Z',
}

// ─── Worker API ───────────────────────────────────────────────────────────────

describe('workerTasksApi.getOpen', () => {
  it('GETs /worker/tasks/open with query params', async () => {
    mock.onGet('/worker/tasks/open').reply(200, { tasks: [mockTask], total: 1, page: 1, limit: 20 })

    const result = await workerTasksApi.getOpen({ lat: 19.097, lng: 72.827, radiusKm: 10 })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].id).toBe('task-1')
    expect(result.total).toBe(1)

    const params = mock.history.get[0].params
    expect(params.lat).toBe(19.097)
    expect(params.radiusKm).toBe(10)
  })
})

describe('workerTasksApi.getTask', () => {
  it('GETs /worker/tasks/:id and unwraps the task from {task:...}', async () => {
    mock.onGet('/worker/tasks/task-1').reply(200, { task: mockTask })

    const task = await workerTasksApi.getTask('task-1')

    expect(task.id).toBe('task-1')
    expect(task.rateCents).toBe(6000)
    // Verify unwrapping — should be Task, not {task: Task}
    expect((task as any).task).toBeUndefined()
  })
})

describe('workerTasksApi.accept', () => {
  it('POSTs to /worker/tasks/:id/accept and returns updated task', async () => {
    const accepted = { ...mockTask, status: 'ACCEPTED' as const, workerId: 'worker-1' }
    mock.onPost('/worker/tasks/task-1/accept').reply(200, { task: accepted })

    const task = await workerTasksApi.accept('task-1')

    expect(task.status).toBe('ACCEPTED')
    expect(task.workerId).toBe('worker-1')
    expect(mock.history.post[0].url).toBe('/worker/tasks/task-1/accept')
  })

  it('rejects with 409 on double-accept', async () => {
    mock.onPost('/worker/tasks/task-1/accept').reply(409, {
      error: { code: 'TASK_ALREADY_ACCEPTED', message: 'Task already has a worker' },
    })

    await expect(workerTasksApi.accept('task-1')).rejects.toMatchObject({
      response: { status: 409 },
    })
  })
})

describe('workerTasksApi.start', () => {
  it('POSTs lat/lng to /worker/tasks/:id/start for geofence check', async () => {
    const inProgress = { ...mockTask, status: 'IN_PROGRESS' as const, startedAt: '2026-03-27T07:00:00.000Z' }
    mock.onPost('/worker/tasks/task-1/start').reply(200, { task: inProgress })

    const task = await workerTasksApi.start('task-1', { lat: 19.097, lng: 72.827 })

    expect(task.status).toBe('IN_PROGRESS')
    expect(task.startedAt).toBeTruthy()

    const body = JSON.parse(mock.history.post[0].data)
    expect(body.lat).toBe(19.097)
    expect(body.lng).toBe(72.827)
  })

  it('rejects with 422 when worker is too far from task location (geofence)', async () => {
    mock.onPost('/worker/tasks/task-1/start').reply(422, {
      error: { code: 'GEOFENCE_VIOLATION', message: 'You must be within 2km of the task location' },
    })

    await expect(workerTasksApi.start('task-1', { lat: 18.0, lng: 73.0 })).rejects.toMatchObject({
      response: { status: 422 },
    })
  })
})

describe('workerTasksApi.submit', () => {
  it('POSTs to /worker/tasks/:id/submit', async () => {
    const submitted = { ...mockTask, status: 'SUBMITTED' as const }
    mock.onPost('/worker/tasks/task-1/submit').reply(200, { task: submitted })

    const task = await workerTasksApi.submit('task-1')

    expect(task.status).toBe('SUBMITTED')
  })
})

describe('workerTasksApi.myTasks', () => {
  it('GETs /worker/my-tasks with status filter', async () => {
    mock.onGet('/worker/my-tasks').reply(200, { tasks: [{ ...mockTask, status: 'IN_PROGRESS' }], total: 1 })

    const result = await workerTasksApi.myTasks({ status: 'ACCEPTED,IN_PROGRESS', limit: 50 })

    expect(result.tasks).toHaveLength(1)
    expect(mock.history.get[0].params.status).toBe('ACCEPTED,IN_PROGRESS')
  })
})

// ─── Buyer API ────────────────────────────────────────────────────────────────

describe('buyerTasksApi.createTask', () => {
  it('POSTs to /buyer/tasks with full task input and returns created task', async () => {
    const created = { ...mockTask, status: 'OPEN' as const, buyerId: 'buyer-1' }
    mock.onPost('/buyer/tasks').reply(201, { task: created })

    const task = await buyerTasksApi.createTask({
      title: 'Clean Juhu Beach',
      description: 'Collect trash',
      category: 'STREET_CLEANING',
      dirtyLevel: 'MEDIUM',
      urgency: 'HIGH',
      rateCents: 6000,
    })

    expect(task.status).toBe('OPEN')
    expect(task.rateCents).toBe(6000)

    const body = JSON.parse(mock.history.post[0].data)
    expect(body.dirtyLevel).toBe('MEDIUM')
  })
})

describe('buyerTasksApi.approve', () => {
  it('POSTs to /buyer/tasks/:id/approve', async () => {
    const approved = { ...mockTask, status: 'APPROVED' as const }
    mock.onPost('/buyer/tasks/task-1/approve').reply(200, { task: approved })

    const task = await buyerTasksApi.approve('task-1')

    expect(task.status).toBe('APPROVED')
  })
})
