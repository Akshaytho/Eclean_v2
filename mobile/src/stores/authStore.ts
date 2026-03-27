// eClean auth store
// Tokens are stored in expo-secure-store (encrypted, hardware-backed)
// User object is kept in memory (re-fetched on app start from /auth/me)
// NEVER store tokens in AsyncStorage

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { User } from '../types'

const KEYS = {
  ACCESS:  'eclean_access_token',
  REFRESH: 'eclean_refresh_token',
  EXPIRES: 'eclean_token_expires',
} as const

// ─── Token helpers (used by api/client.ts interceptors) ──────────────────────

export async function getTokens(): Promise<{
  accessToken:  string | null
  refreshToken: string | null
  expiresAt:    number | null
}> {
  const [accessToken, refreshToken, expiresStr] = await Promise.all([
    SecureStore.getItemAsync(KEYS.ACCESS),
    SecureStore.getItemAsync(KEYS.REFRESH),
    SecureStore.getItemAsync(KEYS.EXPIRES),
  ])
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresStr ? parseInt(expiresStr, 10) : null,
  }
}

export async function saveTokens(tokens: {
  accessToken:  string
  refreshToken: string
  expiresIn:    number // seconds from now
}): Promise<void> {
  const expiresAt = Date.now() + tokens.expiresIn * 1000
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS,  tokens.accessToken),
    SecureStore.setItemAsync(KEYS.REFRESH, tokens.refreshToken),
    SecureStore.setItemAsync(KEYS.EXPIRES, String(expiresAt)),
  ])
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS),
    SecureStore.deleteItemAsync(KEYS.REFRESH),
    SecureStore.deleteItemAsync(KEYS.EXPIRES),
  ])
}

// ─── Zustand store ────────────────────────────────────────────────────────────

interface AuthState {
  user:         User | null
  isLoading:    boolean  // true during initial token check on app launch
  isLoggedIn:   boolean

  setUser:      (user: User) => void
  setLoading:   (loading: boolean) => void
  logout:       () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user:       null,
  isLoading:  true,
  isLoggedIn: false,

  setUser: (user) => set({ user, isLoggedIn: true, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: async () => {
    await clearTokens()
    set({ user: null, isLoggedIn: false, isLoading: false })
  },
}))
