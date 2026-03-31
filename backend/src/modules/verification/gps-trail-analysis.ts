/**
 * GPS Trail Analysis — Extracts behavioral metrics from worker GPS trail.
 *
 * Computed on submit. Answers:
 * - Was the worker at the task location the whole time?
 * - Did they leave and come back?
 * - How much area did they cover?
 * - Were they moving at walking speed or driving?
 *
 * Used by Worker Grace system: if trail proves presence → 12h soft pass.
 */

import { prisma } from '../../lib/prisma'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GPSTrailAnalysis {
  /** Total GPS points recorded */
  totalPoints: number
  /** Total duration from first to last GPS point (seconds) */
  totalDurationSecs: number
  /** Time spent within 200m of task location (seconds) */
  timeAtLocationSecs: number
  /** Time spent more than 200m from task location (seconds) */
  timeAwaySecs: number
  /** Percentage of time at location (0-100) */
  presencePercent: number
  /** Number of times worker left (>200m) and returned */
  departures: number
  /** Maximum distance from task location (meters) */
  maxDistanceMeters: number
  /** Average movement speed (km/h) */
  avgSpeedKmh: number
  /** Number of gaps >2 min with no GPS data */
  gpsGaps: number
  /** Whether trail proves worker was present (>60% time at location) */
  provesPresence: boolean
  /** Flags for suspicious behavior */
  flags: string[]
}

// ─── Haversine Distance ──────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

const PRESENCE_RADIUS_M = 200    // within 200m = "at location"
const GAP_THRESHOLD_MS = 120_000 // 2 min gap = suspicious
const PRESENCE_THRESHOLD = 60    // 60% time at location = proves presence

export async function analyzeGPSTrail(taskId: string): Promise<GPSTrailAnalysis | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { locationLat: true, locationLng: true },
  })
  if (!task?.locationLat || !task?.locationLng) return null

  const logs = await prisma.taskLocationLog.findMany({
    where: { taskId },
    orderBy: { timestamp: 'asc' },
  })

  if (logs.length < 2) {
    return {
      totalPoints: logs.length,
      totalDurationSecs: 0,
      timeAtLocationSecs: 0,
      timeAwaySecs: 0,
      presencePercent: 0,
      departures: 0,
      maxDistanceMeters: 0,
      avgSpeedKmh: 0,
      gpsGaps: 0,
      provesPresence: false,
      flags: ['INSUFFICIENT_GPS_DATA'],
    }
  }

  const taskLat = task.locationLat
  const taskLng = task.locationLng

  let timeAtLocationMs = 0
  let timeAwayMs = 0
  let departures = 0
  let maxDistance = 0
  let totalDistance = 0
  let gpsGaps = 0
  let wasAtLocation = true // assume starts at location
  const flags: string[] = []

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]
    const distance = haversineMeters(taskLat, taskLng, log.lat, log.lng)

    if (distance > maxDistance) maxDistance = distance

    const isAtLocation = distance <= PRESENCE_RADIUS_M

    // Time segment calculation (time between this point and previous)
    if (i > 0) {
      const prev = logs[i - 1]
      const segmentMs = log.timestamp.getTime() - prev.timestamp.getTime()

      // Check for GPS gaps
      if (segmentMs > GAP_THRESHOLD_MS) {
        gpsGaps++
      }

      // Attribute time to at-location or away
      if (isAtLocation) {
        timeAtLocationMs += segmentMs
      } else {
        timeAwayMs += segmentMs
      }

      // Track departures (transition from at-location to away)
      if (wasAtLocation && !isAtLocation) {
        departures++
      }

      // Track total distance moved (for speed calculation)
      totalDistance += haversineMeters(prev.lat, prev.lng, log.lat, log.lng)
    }

    wasAtLocation = isAtLocation
  }

  const firstTimestamp = logs[0].timestamp.getTime()
  const lastTimestamp = logs[logs.length - 1].timestamp.getTime()
  const totalDurationMs = lastTimestamp - firstTimestamp
  const totalDurationSecs = Math.round(totalDurationMs / 1000)
  const totalDurationHours = totalDurationMs / 3600000

  const presencePercent = totalDurationMs > 0
    ? Math.round((timeAtLocationMs / totalDurationMs) * 100)
    : 0

  const avgSpeedKmh = totalDurationHours > 0
    ? Math.round((totalDistance / 1000) / totalDurationHours * 10) / 10
    : 0

  // Generate flags
  if (presencePercent < 40) flags.push('LOW_PRESENCE')
  if (departures > 2) flags.push('MULTIPLE_DEPARTURES')
  if (maxDistance > 5000) flags.push('FAR_FROM_TASK')
  if (avgSpeedKmh > 10) flags.push('VEHICLE_SPEED')
  if (gpsGaps > 2) flags.push('GPS_GAPS')

  const provesPresence = presencePercent >= PRESENCE_THRESHOLD && gpsGaps <= 2

  return {
    totalPoints: logs.length,
    totalDurationSecs,
    timeAtLocationSecs: Math.round(timeAtLocationMs / 1000),
    timeAwaySecs: Math.round(timeAwayMs / 1000),
    presencePercent,
    departures,
    maxDistanceMeters: Math.round(maxDistance),
    avgSpeedKmh,
    gpsGaps,
    provesPresence,
    flags,
  }
}
