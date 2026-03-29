// eClean background location service
// Uses expo-task-manager + expo-location to track GPS even when the phone is locked.
// The TASK_NAME constant must match GPS_TASK_NAME in constants/config.ts.
//
// How it works:
//   1. App calls startBackgroundTracking(taskId) when worker starts a task.
//   2. OS delivers location updates to the task handler (even in background).
//   3. Handler reads activeTaskId from storage, then emits via Socket.io.
//   4. App calls stopBackgroundTracking() when task ends or worker logs out.
//
// NOTE: TaskManager.defineTask must be called at module level (top-level import),
//       not inside a component or effect. Import this file in App.tsx before
//       NavigationContainer to ensure the task is registered before the OS needs it.

import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import * as SecureStore from 'expo-secure-store'
import { GPS_TASK_NAME, GPS_INTERVAL_MS } from '../constants/config'
import { emitGPS } from '../stores/socketStore'
import { useLocationStore } from '../stores/locationStore'
import { useActiveTaskStore } from '../stores/activeTaskStore'

const ACTIVE_TASK_KEY = 'eclean_active_task_id'

// ─── Task definition (must be at module level) ────────────────────────────────

TaskManager.defineTask(GPS_TASK_NAME, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    console.warn('[BG Location] error:', error.message)
    return
  }

  const { locations } = data as { locations: Location.LocationObject[] }
  if (!locations?.length) return

  const loc = locations[locations.length - 1] // use most recent
  const { latitude: lat, longitude: lng, accuracy } = loc.coords

  // Read active task id from SecureStore (Zustand state not accessible in BG task)
  const taskId = await SecureStore.getItemAsync(ACTIVE_TASK_KEY)
  if (!taskId) return

  // Emit GPS via Socket.io (primary transport)
  emitGPS(taskId, lat, lng, accuracy ?? undefined)

  // Update Zustand store (only works when app is in foreground)
  try {
    useLocationStore.getState().setLocation({ lat, lng, accuracy: accuracy ?? undefined, timestamp: Date.now() })
    useActiveTaskStore.getState().appendGPS({ lat, lng, accuracy: accuracy ?? undefined, timestamp: Date.now() })
  } catch {
    // Safe to ignore — store not accessible in background
  }
})

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startBackgroundTracking(taskId: string): Promise<void> {
  // Check permissions before starting
  const { status: fg } = await Location.requestForegroundPermissionsAsync()
  if (fg !== 'granted') {
    console.warn('[BG Location] Foreground permission not granted')
    return
  }
  const { status: bg } = await Location.requestBackgroundPermissionsAsync()
  if (bg !== 'granted') {
    console.warn('[BG Location] Background permission not granted')
    return
  }

  // Persist taskId so the background task can read it
  await SecureStore.setItemAsync(ACTIVE_TASK_KEY, taskId)

  const already = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false)
  if (already) return

  await Location.startLocationUpdatesAsync(GPS_TASK_NAME, {
    accuracy:               Location.Accuracy.High,
    timeInterval:           GPS_INTERVAL_MS,         // 15s
    distanceInterval:       10,                      // also update every 10m moved
    showsBackgroundLocationIndicator: true,          // iOS blue bar
    foregroundService: {
      notificationTitle:   'eClean — Tracking location',
      notificationBody:    'Your location is being shared with the task supervisor.',
      notificationColor:   '#1A73E8',
    },
    pausesUpdatesAutomatically: false,
  })

  useLocationStore.getState().setTracking(true)
}

export async function stopBackgroundTracking(): Promise<void> {
  await SecureStore.deleteItemAsync(ACTIVE_TASK_KEY)

  const running = await Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false)
  if (running) {
    await Location.stopLocationUpdatesAsync(GPS_TASK_NAME)
  }

  useLocationStore.getState().setTracking(false)
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(GPS_TASK_NAME).catch(() => false)
}
