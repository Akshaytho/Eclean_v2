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
  connect:     (accessToken: string) => void
  disconnect:  () => void
  emit:        (event: string, data?: unknown) => void
  joinTask:    (taskId: string) => void
  leaveTask:   (taskId: string) => void
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket:    null,
  connected: false,

  connect: (accessToken: string) => {
    const existing = get().socket
    if (existing?.connected) return

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

    set({ socket })

    // Re-check connection when app comes to foreground
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const s = get().socket
        if (s && !s.connected) s.connect()
      }
    })
  },

  disconnect: () => {
    get().socket?.disconnect()
    set({ socket: null, connected: false })
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
