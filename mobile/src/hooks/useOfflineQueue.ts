import { useEffect, useCallback, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { offlineSync } from '../services/offlineSync'

/**
 * useOfflineQueue — wraps any mutation to be offline-safe.
 *
 * Usage:
 *   const { mutate, isQueued } = useOfflineQueue()
 *
 *   // Instead of direct API call:
 *   mutate({
 *     endpoint: `/tasks/${taskId}/start`,
 *     method:   'POST',
 *     body:     { lat, lng },
 *     tag:      'task-start',
 *   })
 *
 * If online  → executes immediately via offlineSync.enqueue + replay
 * If offline → queues in SecureStore, replays when reconnected
 */

interface QueueItem {
  endpoint: string
  method:   'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?:    Record<string, unknown>
  tag?:     string
}

interface UseOfflineQueueReturn {
  mutate:     (item: QueueItem) => Promise<void>
  replay:     () => Promise<void>
  isOnline:   boolean
  queueSize:  number
}

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [isOnline,  setIsOnline]  = useState(true)
  const [queueSize, setQueueSize] = useState(0)

  // Monitor connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable)
      setIsOnline(online)
      if (online) {
        // Auto-replay queue when back online
        void offlineSync.replay().then(() => {
          void offlineSync.size().then(setQueueSize)
        })
      }
    })
    // Initial size check
    void offlineSync.size().then(setQueueSize)
    return () => unsub()
  }, [])

  const mutate = useCallback(async (item: QueueItem) => {
    await offlineSync.enqueue(item)
    const size = await offlineSync.size()
    setQueueSize(size)
    // Try to replay immediately if online
    const state = await NetInfo.fetch()
    if (state.isConnected && state.isInternetReachable) {
      await offlineSync.replay()
      const newSize = await offlineSync.size()
      setQueueSize(newSize)
    }
  }, [])

  const replay = useCallback(async () => {
    await offlineSync.replay()
    const size = await offlineSync.size()
    setQueueSize(size)
  }, [])

  return { mutate, replay, isOnline, queueSize }
}
