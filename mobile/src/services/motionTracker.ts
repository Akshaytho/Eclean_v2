/**
 * Motion Tracker — Background accelerometer classification.
 *
 * Records accelerometer data in 30-second windows while task is active.
 * Classifies each window: CLEANING | WALKING | STANDING | VEHICLE | ACTIVE
 * Produces a summary on stop: { cleaningPct, walkingPct, standingPct, vehiclePct }
 *
 * V1: Simple threshold-based rules on accelerometer variance.
 * V2 (future): TFLite model for higher accuracy.
 *
 * Zero worker interaction — runs entirely from phone sensors in pocket.
 *
 * Usage:
 *   startMotionTracking()       // call when task starts
 *   const summary = stopMotionTracking()  // call on submit
 */

import { Accelerometer } from 'expo-sensors'

export type MotionClassification = 'CLEANING' | 'WALKING' | 'STANDING' | 'VEHICLE' | 'ACTIVE'

export interface MotionSummary {
  cleaningPct: number   // 0-1
  walkingPct: number
  standingPct: number
  vehiclePct: number
  totalWindows: number
  durationSecs: number
}

interface AccelSample {
  x: number
  y: number
  z: number
}

// ─── State ───────────────────────────────────────────────────────────────────

let subscription: ReturnType<typeof Accelerometer.addListener> | null = null
let sampleBuffer: AccelSample[] = []
let windowClassifications: MotionClassification[] = []
let startTime: number | null = null
let windowInterval: ReturnType<typeof setInterval> | null = null

const SAMPLE_INTERVAL_MS = 100    // 10 Hz
const WINDOW_DURATION_MS = 30_000 // 30 seconds
const SAMPLES_PER_WINDOW = WINDOW_DURATION_MS / SAMPLE_INTERVAL_MS // 300

// ─── Classification (V1 — threshold rules) ───────────────────────────────────

function classifyWindow(samples: AccelSample[]): MotionClassification {
  if (samples.length < 10) return 'STANDING'

  // Compute variance across all axes
  const xMean = samples.reduce((s, v) => s + v.x, 0) / samples.length
  const yMean = samples.reduce((s, v) => s + v.y, 0) / samples.length
  const zMean = samples.reduce((s, v) => s + v.z, 0) / samples.length

  const xVar = samples.reduce((s, v) => s + (v.x - xMean) ** 2, 0) / samples.length
  const yVar = samples.reduce((s, v) => s + (v.y - yMean) ** 2, 0) / samples.length
  const zVar = samples.reduce((s, v) => s + (v.z - zMean) ** 2, 0) / samples.length

  const totalVariance = xVar + yVar + zVar

  // Count Z-axis peaks (step detection for walking)
  const GRAVITY = 9.81
  const zPeaks = samples.filter((s) => Math.abs(s.z - GRAVITY) > 3).length

  // Max acceleration magnitude
  const maxAccel = Math.max(...samples.map((s) => Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2)))

  // Classification rules
  if (totalVariance < 0.5) {
    return 'STANDING'
  }

  if (zPeaks > 30 && totalVariance > 1.0 && totalVariance < 15) {
    return 'WALKING'
  }

  if (maxAccel > 20 && totalVariance > 8) {
    return 'VEHICLE'
  }

  if (totalVariance > 2.0) {
    return 'CLEANING' // sustained non-walking motion = cleaning activity
  }

  return 'ACTIVE' // generic movement
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startMotionTracking(): void {
  // Clean up any existing tracking
  stopMotionTracking()

  sampleBuffer = []
  windowClassifications = []
  startTime = Date.now()

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS)
  subscription = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
    sampleBuffer.push({ x, y, z })
  })

  // Process windows every 30 seconds
  windowInterval = setInterval(() => {
    if (sampleBuffer.length > 0) {
      const classification = classifyWindow(sampleBuffer)
      windowClassifications.push(classification)
      sampleBuffer = [] // reset for next window
    }
  }, WINDOW_DURATION_MS)
}

export function stopMotionTracking(): MotionSummary {
  // Process any remaining samples in buffer
  if (sampleBuffer.length > 10) {
    windowClassifications.push(classifyWindow(sampleBuffer))
  }

  // Clean up
  if (subscription) {
    subscription.remove()
    subscription = null
  }
  if (windowInterval) {
    clearInterval(windowInterval)
    windowInterval = null
  }

  const total = windowClassifications.length
  const durationSecs = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

  if (total === 0) {
    sampleBuffer = []
    windowClassifications = []
    startTime = null
    return { cleaningPct: 0, walkingPct: 0, standingPct: 0, vehiclePct: 0, totalWindows: 0, durationSecs }
  }

  const counts = {
    CLEANING: 0,
    WALKING: 0,
    STANDING: 0,
    VEHICLE: 0,
    ACTIVE: 0,
  }
  for (const c of windowClassifications) counts[c]++

  // ACTIVE counts as cleaning (generic movement while on task)
  const cleaningCount = counts.CLEANING + counts.ACTIVE

  const summary: MotionSummary = {
    cleaningPct: cleaningCount / total,
    walkingPct: counts.WALKING / total,
    standingPct: counts.STANDING / total,
    vehiclePct: counts.VEHICLE / total,
    totalWindows: total,
    durationSecs,
  }

  // Reset state
  sampleBuffer = []
  windowClassifications = []
  startTime = null

  return summary
}

export function isMotionTrackingActive(): boolean {
  return subscription !== null
}
