// useBackgroundLocation — React hook wrapping the backgroundLocation service.
// Handles permission checks, foreground GPS watch, and background task lifecycle.
// Foreground: expo-location watchPositionAsync (5s interval, fast for active screen)
// Background: expo-task-manager via startBackgroundTracking (15s, phone locked)
// GPS is emitted via socket.emit('worker:gps') — NOT HTTP POST.

import { useEffect, useRef, useCallback } from 'react'
import * as Location from 'expo-location'
import { useLocationStore } from '../stores/locationStore'
import {
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../services/backgroundLocation'
import { emitGPS } from '../stores/socketStore'

export function useBackgroundLocation() {
  const {
    currentLocation,
    isTracking,
    hasPermission,
    hasBackgroundPerm,
    setLocation,
    setPermission,
  } = useLocationStore()

  const watchRef = useRef<Location.LocationSubscription | null>(null)

  const checkPermissions = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync()
    const bg = await Location.getBackgroundPermissionsAsync()
    setPermission(fg.granted, bg.granted)
    return { fg: fg.granted, bg: bg.granted }
  }, [setPermission])

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const fg = await Location.requestForegroundPermissionsAsync()
    if (!fg.granted) return false
    const bg = await Location.requestBackgroundPermissionsAsync()
    setPermission(fg.granted, bg.granted)
    return fg.granted
  }, [setPermission])

  // Check permissions on mount
  useEffect(() => {
    checkPermissions()
  }, [checkPermissions])

  const startTracking = useCallback(
    async (taskId: string): Promise<boolean> => {
      const { fg, bg } = await checkPermissions()
      if (!fg) return false

      // Foreground watch: faster updates while screen is active
      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          {
            accuracy:          Location.Accuracy.High,
            timeInterval:      5_000,
            distanceInterval:  5,
          },
          (loc) => {
            const { latitude: lat, longitude: lng, accuracy } = loc.coords
            setLocation({ lat, lng, accuracy: accuracy ?? undefined, timestamp: Date.now() })
            emitGPS(taskId, lat, lng, accuracy ?? undefined)
          },
        )
      }

      // Background tracking: continues when phone is locked or app is backgrounded
      if (bg) {
        await startBackgroundTracking(taskId)
      }

      return true
    },
    [checkPermissions, setLocation],
  )

  const stopTracking = useCallback(async (): Promise<void> => {
    watchRef.current?.remove()
    watchRef.current = null
    await stopBackgroundTracking()
  }, [])

  // Cleanup foreground watch on unmount
  useEffect(() => {
    return () => {
      watchRef.current?.remove()
      watchRef.current = null
    }
  }, [])

  return {
    currentLocation,
    isTracking,
    hasPermission,
    hasBackgroundPerm,
    requestPermissions,
    startTracking,
    stopTracking,
  }
}
