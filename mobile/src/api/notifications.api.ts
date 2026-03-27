import { apiClient } from './client'
import type { Notification } from '../types'

export const notificationsApi = {
  list: (page = 1) =>
    apiClient.get<{ notifications: Notification[]; unreadCount: number }>(
      '/notifications', { params: { page } },
    ).then((r) => r.data),

  markRead: (id: string) =>
    apiClient.post(`/notifications/${id}/read`),

  markAllRead: () =>
    apiClient.post('/notifications/read-all'),

  saveDeviceToken: (token: string) =>
    apiClient.post('/notifications/device-token', { token }),
}
