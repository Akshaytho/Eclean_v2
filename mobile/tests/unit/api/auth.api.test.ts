/**
 * Unit tests for auth.api.ts
 * Verifies that each function calls the correct endpoint with the right
 * request shape and correctly maps the response.
 * HTTP calls are intercepted by axios-mock-adapter — no network required.
 */
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '../../../src/api/client'
import { authApi } from '../../../src/api/auth.api'

const mock = new MockAdapter(apiClient, { onNoMatch: 'throwException' })

afterEach(() => mock.reset())
afterAll(() => mock.restore())

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'worker@eclean.test',
  name: 'Test Worker',
  role: 'WORKER' as const,
}

const mockLoginResponse = {
  user: mockUser,
  accessToken: 'access-abc',
  refreshToken: 'refresh-xyz',
  expiresIn: 900,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authApi.login', () => {
  it('POSTs to /auth/login with email + password and returns tokens', async () => {
    mock.onPost('/auth/login', { email: 'worker@eclean.test', password: 'Test@1234' })
      .reply(200, mockLoginResponse)

    const result = await authApi.login('worker@eclean.test', 'Test@1234')

    expect(result.user.role).toBe('WORKER')
    expect(result.user.email).toBe('worker@eclean.test')
    expect(result.accessToken).toBe('access-abc')
    expect(result.refreshToken).toBe('refresh-xyz')
    expect(result.expiresIn).toBe(900)
  })

  it('rejects with the error when backend returns 401', async () => {
    mock.onPost('/auth/login').reply(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' } })

    await expect(authApi.login('x@x.com', 'wrong')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })
})

describe('authApi.register', () => {
  it('POSTs to /auth/register with all required fields', async () => {
    mock.onPost('/auth/register').reply(201, mockLoginResponse)

    const result = await authApi.register({
      email: 'new@eclean.test',
      password: 'Test@1234',
      name: 'New User',
      role: 'WORKER',
    })

    expect(result.user.id).toBe('user-1')
    expect(mock.history.post[0].data).toContain('"role":"WORKER"')
  })
})

describe('authApi.me', () => {
  it('GETs /auth/me and returns the user object (unwrapped from {user:...})', async () => {
    mock.onGet('/auth/me').reply(200, { user: mockUser })

    const user = await authApi.me()

    expect(user.id).toBe('user-1')
    expect(user.email).toBe('worker@eclean.test')
    // Verify the wrapper is stripped — should be the User, not {user: User}
    expect((user as any).user).toBeUndefined()
  })
})

describe('authApi.logout', () => {
  it('POSTs to /auth/logout', async () => {
    mock.onPost('/auth/logout').reply(200, {})

    await authApi.logout()

    expect(mock.history.post).toHaveLength(1)
    expect(mock.history.post[0].url).toBe('/auth/logout')
  })
})
