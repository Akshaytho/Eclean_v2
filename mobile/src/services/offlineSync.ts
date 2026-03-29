// eClean offline sync service
// Queues API calls that fail due to no network connection.
// On reconnect, replays them in order (FIFO).
//
// Persisted in SecureStore so the queue survives app restarts.
// Only safe for idempotent operations (photo upload, GPS, task events).
//
// Usage:
//   import { offlineSync } from '../services/offlineSync'
//   offlineSync.enqueue({ endpoint: '/tasks/x/media', method: 'POST', body: { ... }, tag: 'photo' })
//   offlineSync.replay()  // called automatically on NetInfo reconnect

import * as SecureStore from 'expo-secure-store'
import NetInfo from '@react-native-community/netinfo'
import { apiClient } from '../api/client'
import type { OfflineQueueItem } from '../types'

const QUEUE_KEY = 'eclean_offline_queue'
const MAX_QUEUE_SIZE = 50

async function readQueue(): Promise<OfflineQueueItem[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : []
  } catch {
    return []
  }
}

async function writeQueue(items: OfflineQueueItem[]): Promise<void> {
  await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(items))
}

let isReplaying = false

export const offlineSync = {
  async enqueue(item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'retries'>): Promise<void> {
    const queue = await readQueue()
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('[OfflineSync] Queue full, dropping oldest item')
      queue.shift()
    }
    const entry: OfflineQueueItem = {
      ...item,
      id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      retries:   0,
    }
    queue.push(entry)
    await writeQueue(queue)
  },

  async replay(): Promise<void> {
    if (isReplaying) return
    isReplaying = true

    try {
      const queue = await readQueue()
      if (!queue.length) return

      const remaining: OfflineQueueItem[] = []

      for (const item of queue) {
        try {
          await apiClient.request({
            url:    item.endpoint,
            method: item.method,
            data:   item.body,
          })
          // success — don't re-add to queue
        } catch {
          item.retries = (item.retries ?? 0) + 1
          if (item.retries < 3) {
            remaining.push(item)
          }
          // drop after 3 retries
        }
      }

      await writeQueue(remaining)
    } finally {
      isReplaying = false
    }
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(QUEUE_KEY)
  },

  async size(): Promise<number> {
    const queue = await readQueue()
    return queue.length
  },
}

// ─── Auto-replay on reconnect ─────────────────────────────────────────────────

let netInfoUnsub: (() => void) | null = null

export function startNetInfoListener(): void {
  if (netInfoUnsub) return
  netInfoUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      offlineSync.replay().catch(() => {})
    }
  })
}

export function stopNetInfoListener(): void {
  netInfoUnsub?.()
  netInfoUnsub = null
}

// Start listening immediately on import
startNetInfoListener()
