import { useCallback } from 'react'
import { haversineKm } from '../utils/distance'

interface GeofenceResult {
  withinRange:  boolean
  distanceKm:   number
  distanceM:    number
}

/**
 * useGeofence — check if current position is within radiusKm of a target.
 *
 * Usage:
 *   const { checkGeofence } = useGeofence()
 *   const result = checkGeofence(
 *     { lat: workerLat, lng: workerLng },
 *     { lat: taskLat,   lng: taskLng },
 *     2  // 2km radius
 *   )
 *   if (!result.withinRange) alert(`You are ${result.distanceM}m away`)
 */
export function useGeofence() {
  const checkGeofence = useCallback(
    (
      from:     { lat: number; lng: number },
      target:   { lat: number; lng: number },
      radiusKm: number = 2,
    ): GeofenceResult => {
      const distanceKm = haversineKm(from.lat, from.lng, target.lat, target.lng)
      return {
        withinRange: distanceKm <= radiusKm,
        distanceKm,
        distanceM:   Math.round(distanceKm * 1000),
      }
    },
    [],
  )

  return { checkGeofence }
}
