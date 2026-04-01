// eClean API client
// - Axios instance with base URL from config
// - Request interceptor: attach access token from SecureStore
// - Response interceptor: on 401 → refresh token → retry original request
//   If refresh fails → clear tokens → navigate to Login
// - Offline detection via NetInfo: queues failed mutations

import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import NetInfo from '@react-native-community/netinfo'
import { API_URL } from '../constants/config'
import { getTokens, clearTokens, saveTokens } from '../stores/authStore'
import { useSocketStore } from '../stores/socketStore'
import { navigationRef } from '../navigation/navigationRef'

// ─── Axios instance ───────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL:        `${API_URL}/api/v1`,
  timeout:        15_000,
  headers:        { 'Content-Type': 'application/json' },
})

// ─── Prevent multiple simultaneous refresh calls ──────────────────────────────

let isRefreshing = false
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function processQueue(newToken: string): void {
  refreshQueue.forEach(({ resolve }) => resolve(newToken))
  refreshQueue = []
}

function rejectQueue(error: unknown): void {
  refreshQueue.forEach(({ reject }) => reject(error))
  refreshQueue = []
}

// ─── Request interceptor — attach token ──────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const { accessToken } = await getTokens()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Response interceptor — handle 401 / token refresh ───────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Don't retry the refresh endpoint itself
    if (original.url?.includes('/auth/refresh')) {
      await clearTokens()
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Auth' }] })
      return Promise.reject(error)
    }

    original._retry = true

    if (isRefreshing) {
      // Wait for the ongoing refresh to finish, then retry
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject })
      }).then((newToken) => {
        if (original.headers) {
          original.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(original)
      })
    }

    isRefreshing = true

    try {
      const { refreshToken } = await getTokens()
      if (!refreshToken) throw new Error('No refresh token')

      // Body-based refresh (no cookies on mobile)
      const res = await axios.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
        `${API_URL}/api/v1/auth/refresh`,
        { refreshToken },
      )

      const { accessToken: newAccess, refreshToken: newRefresh, expiresIn } = res.data
      await saveTokens({ accessToken: newAccess, refreshToken: newRefresh, expiresIn })
      processQueue(newAccess)

      // Update socket auth with new token (prevents stale token on active connection)
      const socket = useSocketStore.getState().socket
      if (socket) {
        socket.auth = { token: newAccess }
      }

      if (original.headers) {
        original.headers.Authorization = `Bearer ${newAccess}`
      }
      return apiClient(original)
    } catch (refreshError) {
      rejectQueue(refreshError)
      await clearTokens()
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Auth' }] })
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  },
)

// ─── Offline check ────────────────────────────────────────────────────────────

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch()
  return state.isConnected === true && state.isInternetReachable !== false
}
