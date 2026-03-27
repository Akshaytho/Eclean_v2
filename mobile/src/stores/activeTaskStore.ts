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
    set((state) => ({ gpsTrail: [...state.gpsTrail, coord] })),

  clearGPSTrail: () => set({ gpsTrail: [] }),

  setElapsedSecs: (elapsedSecs) => set({ elapsedSecs }),
}))
