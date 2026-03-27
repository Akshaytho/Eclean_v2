// eClean location store
// Tracks current GPS position, permission status, and tracking state.
// Foreground tracking via expo-location watchPositionAsync.
// Background tracking via expo-task-manager (see services/backgroundLocation.ts).

import { create } from 'zustand'
import type { GPSCoord } from '../types'

interface LocationState {
  currentLocation:    GPSCoord | null
  isTracking:         boolean
  hasPermission:      boolean
  hasBackgroundPerm:  boolean
  accuracy:           number | null

  setLocation:       (coord: GPSCoord) => void
  setTracking:       (tracking: boolean) => void
  setPermission:     (fg: boolean, bg: boolean) => void
}

export const useLocationStore = create<LocationState>((set) => ({
  currentLocation:   null,
  isTracking:        false,
  hasPermission:     false,
  hasBackgroundPerm: false,
  accuracy:          null,

  setLocation: (coord) => set({ currentLocation: coord, accuracy: coord.accuracy ?? null }),

  setTracking: (isTracking) => set({ isTracking }),

  setPermission: (fg, bg) => set({ hasPermission: fg, hasBackgroundPerm: bg }),
}))
