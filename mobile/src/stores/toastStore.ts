// eClean toast store
// Lightweight in-app toast notifications (success, error, info, warning).
// Toasts auto-dismiss after `duration` ms (default 3500).
// Max 3 toasts visible at once — oldest is removed when a 4th arrives.

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id:       string
  type:     ToastType
  message:  string
  duration: number
}

// Track timeout IDs so we can clean up if toast is manually dismissed
const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>()

interface ToastState {
  toasts: Toast[]
  show:   (message: string, type?: ToastType, duration?: number) => void
  hide:   (id: string) => void
  clear:  () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const toast: Toast = { id, type, message, duration }

    set((state) => ({
      toasts: [...state.toasts.slice(-2), toast], // keep max 3
    }))

    // auto-dismiss with tracked timeout
    const tid = setTimeout(() => {
      timeoutMap.delete(id)
      get().hide(id)
    }, duration)
    timeoutMap.set(id, tid)
  },

  hide: (id) => {
    // Clear timeout if toast dismissed early (e.g. by user tap)
    const tid = timeoutMap.get(id)
    if (tid) { clearTimeout(tid); timeoutMap.delete(id) }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  clear: () => {
    // Clear all pending timeouts
    timeoutMap.forEach(tid => clearTimeout(tid))
    timeoutMap.clear()
    set({ toasts: [] })
  },
}))

// ─── Convenience helpers (call outside components) ───────────────────────────

export const toast = {
  success: (msg: string, dur?: number) =>
    useToastStore.getState().show(msg, 'success', dur),
  error: (msg: string, dur?: number) =>
    useToastStore.getState().show(msg, 'error', dur),
  info: (msg: string, dur?: number) =>
    useToastStore.getState().show(msg, 'info', dur),
  warning: (msg: string, dur?: number) =>
    useToastStore.getState().show(msg, 'warning', dur),
}
