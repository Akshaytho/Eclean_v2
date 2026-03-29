import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api/notifications.api'
import { useAuthStore } from '../stores/authStore'
import { useSocket } from './useSocket'

export function useUnreadCount() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count', user?.id],
    queryFn:  async () => {
      const res = await notificationsApi.list(1)
      return res.unreadCount ?? 0
    },
    enabled:   !!user,
    staleTime: 60_000,
  })

  const onNotification = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
  }, [queryClient])

  useSocket('notification:new', onNotification)

  return { count: data ?? 0 }
}
