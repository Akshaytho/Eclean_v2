// eClean active task store
// Tracks the worker's currently active task.
// Timer is computed from task.startedAt (server timestamp) — NOT a local counter.
// This means the timer survives app restarts correctly.
// GPS trail is kept in memory for the map polyline during the session.

import { create } from 'zustand'
import type { Task, GPSCoord } from '../types'

interface ActiveTaskState {
  activeTask:   Task | null
  gpsTrail:     GPSCoord[]           // ordered list of GPS points for polyline
  elapsedSecs:  number               // updated every second by a setInterval

  setActiveTask:   (task: Task | null) => void
  appendGPS:       (coord: GPSCoord) => void
  clearGPSTrail:   () => void
  setElapsedSecs:  (secs: number) => void
}

export const useActiveTaskStore = create<ActiveTaskState>((set) => ({
  activeTask:   null,
  gpsTrail:     [],
  elapsedSecs:  0,

  setActiveTask: (task) =>
    set({
      activeTask:  task,
      gpsTrail:    [],          // reset trail when task changes
      elapsedSecs: task?.startedAt
        ? Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 1000)
        : 0,
    }),

  appendGPS: (coord) =>
    set((state) => {
      const trail = state.gpsTrail
      if (trail.length < 300) {
        return { gpsTrail: [...trail, coord] }
      }
      // Downsample: keep every other point from first half, all points from second half
      const half = Math.floor(trail.length / 2)
      const downsampled = [
        ...trail.slice(0, half).filter((_, i) => i % 2 === 0),
        ...trail.slice(half),
        coord,
      ]
      return { gpsTrail: downsampled }
    }),

  clearGPSTrail: () => set({ gpsTrail: [] }),

  setElapsedSecs: (elapsedSecs) => set({ elapsedSecs }),
}))
