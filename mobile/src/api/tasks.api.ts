import { apiClient } from './client'
import type { Task, TaskCategory, TaskUrgency, DirtyLevel } from '../types'

// ─── Worker ───────────────────────────────────────────────────────────────────

export const workerTasksApi = {
  getOpen: (params: {
    lat?: number; lng?: number; radiusKm?: number
    category?: TaskCategory; urgency?: TaskUrgency
    page?: number; limit?: number
  }) =>
    apiClient.get<{ tasks: Task[]; total: number; page: number; limit: number }>(
      '/worker/tasks/open', { params },
    ).then((r) => r.data),

  getTask: (taskId: string) =>
    apiClient.get<{ task: Task }>(`/worker/tasks/${taskId}`).then((r) => r.data.task),

  myTasks: (params: { status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ tasks: Task[]; total: number }>('/worker/my-tasks', { params }).then((r) => r.data),

  accept: (taskId: string) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/accept`).then((r) => r.data.task),

  // lat/lng optional — used for geofence check when task has a location
  start: (taskId: string, coords?: { lat: number; lng: number }) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/start`, coords ?? {}).then((r) => r.data.task),

  submit: (taskId: string) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/submit`).then((r) => r.data.task),

  cancel: (taskId: string, reason: string) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/cancel`, { reason }).then((r) => r.data.task),

  retry: (taskId: string) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/retry`).then((r) => r.data.task),

  dispute: (taskId: string, reason: string) =>
    apiClient.post<{ task: Task }>(`/worker/tasks/${taskId}/dispute`, { reason }).then((r) => r.data.task),

  // HTTP fallback for GPS — primary path is socket.emit('worker:gps')
  logLocation: (taskId: string, lat: number, lng: number, accuracy?: number) =>
    apiClient.post(`/worker/tasks/${taskId}/location`, { lat, lng, accuracy }),

  getChatHistory: (taskId: string, cursor?: string) =>
    apiClient.get(`/worker/tasks/${taskId}/chat`, { params: { cursor, limit: 50 } }).then((r) => r.data),

  getWallet: () =>
    apiClient.get('/worker/wallet').then((r) => r.data),

  getPayouts: (page = 1) =>
    apiClient.get('/worker/payouts', { params: { page } }).then((r) => r.data),
}

// ─── Buyer ────────────────────────────────────────────────────────────────────

export const buyerTasksApi = {
  createTask: (input: {
    title: string; description: string; category: TaskCategory
    dirtyLevel: DirtyLevel; urgency?: TaskUrgency; rateCents?: number
    locationLat?: number; locationLng?: number; locationAddress?: string
    zoneId?: string; workWindowStart?: string; workWindowEnd?: string
    razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string
  }) =>
    apiClient.post<{ task: Task }>('/buyer/tasks', input).then((r) => r.data.task),

  listTasks: (params: { status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ tasks: Task[]; total: number }>('/buyer/tasks', { params }).then((r) => r.data),

  getTask: (taskId: string) =>
    apiClient.get<{ task: Task }>(`/buyer/tasks/${taskId}`).then((r) => r.data.task),

  approve: (taskId: string) =>
    apiClient.post<{ task: Task }>(`/buyer/tasks/${taskId}/approve`).then((r) => r.data.task),

  reject: (taskId: string, reason: string) =>
    apiClient.post<{ task: Task }>(`/buyer/tasks/${taskId}/reject`, { reason }).then((r) => r.data.task),

  cancel: (taskId: string, reason: string) =>
    apiClient.post<{ task: Task }>(`/buyer/tasks/${taskId}/cancel`, { reason }).then((r) => r.data.task),

  rate: (taskId: string, rating: number, comment?: string) =>
    apiClient.post(`/buyer/tasks/${taskId}/rate`, { rating, comment }),

  getChatHistory: (taskId: string, cursor?: string) =>
    apiClient.get(`/buyer/tasks/${taskId}/chat`, { params: { cursor, limit: 50 } }).then((r) => r.data),
}
