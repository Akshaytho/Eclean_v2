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
      reconnectionAttempts:   Infinity,     // always try to reconnect
      reconnectionDelay:      1_000,
      reconnectionDelayMax:   10_000,
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

// Helper for components to emit GPS (primary transport for worker location)
export function emitGPS(taskId: string, lat: number, lng: number, accuracy?: number): void {
  useSocketStore.getState().emit('worker:gps', { taskId, lat, lng, accuracy })
}
