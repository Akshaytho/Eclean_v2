// eClean socket store
// One persistent socket connection per authenticated session.
// Reconnects automatically — reconnectionAttempts: Infinity (not 5 like old app).
// GPS events go through this socket (worker:gps), NOT HTTP POST.

import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import { AppState } from 'react-native'
import { SOCKET_URL } from '../constants/config'
import { getTokens } from './authStore'

interface SocketState {
  socket:      Socket | null
  connected:   boolean
  appStateSub: ReturnType<typeof AppState.addEventListener> | null
  connect:     (accessToken: string) => void
  disconnect:  () => void
  emit:        (event: string, data?: unknown) => void
  joinTask:    (taskId: string) => void
  leaveTask:   (taskId: string) => void
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket:      null,
  connected:   false,
  appStateSub: null,

  connect: (accessToken: string) => {
    const existing = get().socket
    if (existing?.connected) return

    // Clean up previous socket if it exists but isn't connected
    if (existing) {
      existing.removeAllListeners()
      existing.disconnect()
    }
    // Clean up previous AppState subscription
    get().appStateSub?.remove()

    const socket = io(SOCKET_URL, {
      auth:                   { token: accessToken },
      transports:             ['websocket'],
      reconnectionAttempts:   20,            // give up after 20 tries (not infinite)
      reconnectionDelay:      1_000,
      reconnectionDelayMax:   30_000,        // back off up to 30s (was 10s)
      randomizationFactor:    0.5,           // jitter to avoid thundering herd
      timeout:                10_000,
    })

    socket.on('connect', () => {
      set({ connected: true })
    })

    socket.on('disconnect', () => {
      set({ connected: false })
    })

    socket.on('connect_error', () => {
      set({ connected: false })
    })

    // Bug #1 fix: refresh token on every reconnect attempt so we don't use stale tokens
    socket.io.on('reconnect_attempt', async () => {
      try {
        const { accessToken } = await getTokens()
        if (accessToken) {
          socket.auth = { token: accessToken }
        }
      } catch {}
    })

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const s = get().socket
        if (s && !s.connected) s.connect()
      }
    })

    set({ socket, appStateSub })
  },

  disconnect: () => {
    const { socket, appStateSub } = get()
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
    }
    appStateSub?.remove()
    set({ socket: null, connected: false, appStateSub: null })
  },

  emit: (event, data) => {
    const { socket, connected } = get()
    if (socket && connected) {
      socket.emit(event, data)
    }
  },

  joinTask: (taskId) => {
    get().emit('join_task_room', { taskId })
  },

  leaveTask: (taskId) => {
    get().emit('leave_task_room', { taskId })
  },
}))

// Helper for components to emit GPS (primary transport for worker location).
// Falls back to HTTP POST when socket is disconnected to prevent GPS trail gaps.
export function emitGPS(taskId: string, lat: number, lng: number, accuracy?: number): void {
  const { socket, connected } = useSocketStore.getState()
  if (socket && connected) {
    socket.emit('worker:gps', { taskId, lat, lng, accuracy })
  } else {
    // HTTP fallback — import inline to avoid circular dependency
    import('../api/tasks.api').then(({ workerTasksApi }) => {
      workerTasksApi.logLocation(taskId, lat, lng, accuracy).catch(() => {
        console.warn('[GPS] HTTP fallback failed — GPS point lost')
      })
    }).catch(() => {})
  }
}
