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

    // auto-dismiss
    setTimeout(() => {
      get().hide(id)
    }, duration)
  },

  hide: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
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
