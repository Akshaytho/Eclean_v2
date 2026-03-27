/**
 * Unit tests for authStore.ts
 * Tests the Zustand store actions and the SecureStore token helpers.
 * expo-secure-store is replaced by the in-memory mock via moduleNameMapper.
 */
import { useAuthStore, saveTokens, getTokens, clearTokens } from '../../../src/stores/authStore'
import * as SecureStore from 'expo-secure-store'

// Reset store state between tests
beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: true, isLoggedIn: false })
  jest.clearAllMocks()
  // Clear the in-memory SecureStore (mock's __clearStore helper)
  ;(SecureStore as any).__clearStore?.()
})

const mockUser = {
  id: 'user-1',
  email: 'worker@eclean.test',
  name: 'Test Worker',
  role: 'WORKER' as const,
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

describe('saveTokens / getTokens / clearTokens', () => {
  it('saves tokens and reads them back correctly', async () => {
    await saveTokens({ accessToken: 'acc-123', refreshToken: 'ref-456', expiresIn: 900 })

    const tokens = await getTokens()

    expect(tokens.accessToken).toBe('acc-123')
    expect(tokens.refreshToken).toBe('ref-456')
    // expiresAt should be roughly now + 900s
    expect(tokens.expiresAt).toBeGreaterThan(Date.now())
    expect(tokens.expiresAt).toBeLessThan(Date.now() + 901_000)
  })

  it('returns null for all fields when no tokens stored', async () => {
    const tokens = await getTokens()

    expect(tokens.accessToken).toBeNull()
    expect(tokens.refreshToken).toBeNull()
    expect(tokens.expiresAt).toBeNull()
  })

  it('clearTokens removes all stored tokens', async () => {
    await saveTokens({ accessToken: 'acc-123', refreshToken: 'ref-456', expiresIn: 900 })
    await clearTokens()

    const tokens = await getTokens()

    expect(tokens.accessToken).toBeNull()
    expect(tokens.refreshToken).toBeNull()
  })
})

// ─── Store actions ─────────────────────────────────────────────────────────────

describe('useAuthStore.setUser', () => {
  it('sets user, marks logged in, and clears loading flag', () => {
    const { setUser } = useAuthStore.getState()
    setUser(mockUser)

    const state = useAuthStore.getState()

    expect(state.user).toEqual(mockUser)
    expect(state.isLoggedIn).toBe(true)
    expect(state.isLoading).toBe(false)
  })
})

describe('useAuthStore.setLoading', () => {
  it('updates isLoading flag only', () => {
    const { setLoading } = useAuthStore.getState()
    setLoading(false)

    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('useAuthStore.logout', () => {
  it('clears user, sets isLoggedIn=false, removes tokens from SecureStore', async () => {
    // Arrange: store a user + tokens
    useAuthStore.setState({ user: mockUser, isLoggedIn: true, isLoading: false })
    await saveTokens({ accessToken: 'acc', refreshToken: 'ref', expiresIn: 900 })

    await useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isLoggedIn).toBe(false)
    expect(state.isLoading).toBe(false)

    // Tokens should be gone from SecureStore
    const tokens = await getTokens()
    expect(tokens.accessToken).toBeNull()
  })
})
