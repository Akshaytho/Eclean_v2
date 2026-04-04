/**
 * MMKV storage wrapper for React Query persistence.
 *
 * PERF: MMKV is ~30x faster than AsyncStorage for disk I/O.
 * On a ₹3000 budget phone: AsyncStorage read = 50-200ms, MMKV read = 1-3ms.
 * This directly impacts app cold-start (loading cached screens from disk).
 *
 * Also used as the sync persister interface for @tanstack/query-sync-storage-persister.
 */
import { MMKV } from 'react-native-mmkv'

export const mmkv = new MMKV({ id: 'eclean-cache' })

/**
 * Sync storage interface compatible with @tanstack/query-sync-storage-persister.
 * Unlike AsyncStorage (async), MMKV is synchronous — no awaits, no microtask delays.
 */
export const mmkvStorage = {
  getItem: (key: string): string | null => {
    return mmkv.getString(key) ?? null
  },
  setItem: (key: string, value: string): void => {
    mmkv.set(key, value)
  },
  removeItem: (key: string): void => {
    mmkv.delete(key)
  },
}
