/**
 * Integration tests — Worker + Buyer task data flow
 * Registers fresh test users, creates a task as buyer, verifies worker can see it.
 */
import axios from 'axios'
import type { Task, TaskStatus } from '../../src/types'

const API = 'http://localhost:3000/api/v1'
const http = axios.create({ baseURL: API, timeout: 10_000 })

const RUN_ID = Date.now()
const password = 'Test@1234'
let backendRunning = false
let workerToken: string
let buyerToken: string
let createdTaskId: string

beforeAll(async () => {
  try {
    await axios.get('http://localhost:3000/health', { timeout: 3_000 })
    backendRunning = true
  } catch {
    console.warn('\n⚠️  Backend not running — skipping tasks integration tests\n')
    return
  }

  // Register + login both roles
  const [wReg, bReg] = await Promise.all([
    http.post('/auth/register', { email: `itest-w-${RUN_ID}@eclean.test`, password, name: 'Worker', role: 'WORKER' }),
    http.post('/auth/register', { email: `itest-b-${RUN_ID}@eclean.test`, password, name: 'Buyer',  role: 'BUYER'  }),
  ])
  workerToken = wReg.data.accessToken
  buyerToken  = bReg.data.accessToken
})

const skipIfOffline = () => { if (!backendRunning) pending() }
const workerAuth = () => ({ headers: { Authorization: `Bearer ${workerToken}` } })
const buyerAuth  = () => ({ headers: { Authorization: `Bearer ${buyerToken}` } })

// ─── Create task (buyer) ──────────────────────────────────────────────────────

describe('POST /buyer/tasks', () => {
  it('creates a MEDIUM task and returns rateCents = 6000', async () => {
    skipIfOffline()

    const res = await http.post('/buyer/tasks', {
      title:       'Integration Test Task',
      description: 'Created by mobile integration test',
      category:    'STREET_CLEANING',
      dirtyLevel:  'MEDIUM',
      urgency:     'LOW',
    }, buyerAuth())

    expect(res.status).toBe(201)

    const task: Task = res.data.task
    createdTaskId = task.id

    expect(task.id).toBeTruthy()
    expect(task.title).toBe('Integration Test Task')
    expect(task.status).toBe('OPEN' satisfies TaskStatus)
    expect(task.rateCents).toBe(6000)           // MEDIUM = ₹60.00
    expect(Number.isInteger(task.rateCents)).toBe(true)  // always integer paise
    expect(task.buyerId).toBeTruthy()
    expect(task.workerId).toBeNull()
    expect(task.createdAt).toBeTruthy()
  })
})

// ─── Open tasks (worker) ──────────────────────────────────────────────────────

describe('GET /worker/tasks/open', () => {
  it('returns paginated task list with correct shape', async () => {
    skipIfOffline()

    const res = await http.get('/worker/tasks/open', {
      ...workerAuth(),
      params: { limit: 5, page: 1 },
    })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.tasks)).toBe(true)
    expect(typeof res.data.total).toBe('number')
    expect(res.data.page).toBe(1)

    if (res.data.tasks.length > 0) {
      const task: Task = res.data.tasks[0]
      expect(task.id).toBeTruthy()
      expect(task.title).toBeTruthy()
      expect(['LIGHT', 'MEDIUM', 'HEAVY', 'CRITICAL']).toContain(task.dirtyLevel)
      expect(Number.isInteger(task.rateCents)).toBe(true)
      expect(task.status).toBe('OPEN')
    }
  })

  it('filters by category param', async () => {
    skipIfOffline()

    const res = await http.get('/worker/tasks/open', {
      ...workerAuth(),
      params: { category: 'STREET_CLEANING', limit: 5 },
    })

    expect(res.status).toBe(200)
    res.data.tasks.forEach((t: Task) => {
      expect(t.category).toBe('STREET_CLEANING')
    })
  })
})

// ─── Task detail (worker) ─────────────────────────────────────────────────────

describe('GET /worker/tasks/:id', () => {
  it('returns full task detail with correct shape', async () => {
    skipIfOffline()
    if (!createdTaskId) pending()

    const res = await http.get(`/worker/tasks/${createdTaskId}`, workerAuth())

    expect(res.status).toBe(200)

    const task: Task = res.data.task
    expect(task.id).toBe(createdTaskId)
    expect(task.description).toBe('Created by mobile integration test')
    expect(task.dirtyLevel).toBe('MEDIUM')
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ─── My tasks (worker) ────────────────────────────────────────────────────────

describe('GET /worker/my-tasks', () => {
  it('returns task list with correct structure (no filter)', async () => {
    skipIfOffline()

    // Note: comma-separated status filter is supported after next server restart
    // (tasks.schema.ts updated to accept status=ACCEPTED,IN_PROGRESS etc.)
    const res = await http.get('/worker/my-tasks', workerAuth())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.tasks)).toBe(true)
    expect(typeof res.data.total).toBe('number')
  })

  it('filters by single status value', async () => {
    skipIfOffline()

    const res = await http.get('/worker/my-tasks', {
      ...workerAuth(),
      params: { status: 'ACCEPTED' },
    })

    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.tasks)).toBe(true)
  })
})
