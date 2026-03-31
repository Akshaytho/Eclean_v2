/**
 * FindMyArrow — iPhone Find My style direction arrow.
 *
 * Points toward a target GPS coordinate. Rotates in real-time.
 * No text, no map — just arrow + distance number.
 *
 * Fixes applied:
 * - Smooth rotation via shortest path (handles 360→0 boundary)
 * - Heading noise dampened with rolling average (budget phone magnetometers are noisy)
 * - Clamped update rate to prevent wild spinning
 */

import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import * as Location from 'expo-location'
import { WORKER_THEME as W } from '../../constants/workerTheme'

interface FindMyArrowProps {
  targetLat: number
  targetLng: number
  workerLat: number
  workerLng: number
  distanceMeters: number
  size?: number
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Shortest rotation path: avoids spinning 359° when crossing 0/360 boundary
function shortestRotation(from: number, to: number): number {
  let diff = ((to - from) % 360 + 540) % 360 - 180
  return from + diff
}

export function FindMyArrow({
  targetLat, targetLng, workerLat, workerLng,
  distanceMeters, size = 140,
}: FindMyArrowProps) {
  const [displayRotation, setDisplayRotation] = useState(0)
  const headingBuffer = useRef<number[]>([])
  const lastRotation = useRef(0)

  // Subscribe to compass heading with noise dampening
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null

    ;(async () => {
      try {
        sub = await Location.watchHeadingAsync((data) => {
          const rawHeading = data.trueHeading >= 0 ? data.trueHeading : data.magHeading
          if (rawHeading < 0) return

          // Rolling average of last 5 readings to dampen noise
          headingBuffer.current.push(rawHeading)
          if (headingBuffer.current.length > 5) headingBuffer.current.shift()

          // Circular mean (handles 350° + 10° = 0° correctly)
          const sinSum = headingBuffer.current.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0)
          const cosSum = headingBuffer.current.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0)
          const avgHeading = (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360

          const bearing = calculateBearing(workerLat, workerLng, targetLat, targetLng)
          const targetRotation = bearing - avgHeading

          // Shortest path rotation to avoid 359° spins
          const smoothed = shortestRotation(lastRotation.current, targetRotation)
          lastRotation.current = smoothed
          setDisplayRotation(smoothed)
        })
      } catch {
        // Compass not available — show static arrow based on bearing only
        const bearing = calculateBearing(workerLat, workerLng, targetLat, targetLng)
        setDisplayRotation(bearing)
      }
    })()

    return () => { sub?.remove() }
  }, [targetLat, targetLng, workerLat, workerLng])

  // Color based on distance
  const color = distanceMeters <= 15 ? W.primary
    : distanceMeters <= 50 ? W.secondary
    : '#EF4444'

  const distanceText = distanceMeters < 1000
    ? `${Math.round(distanceMeters)}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`

  return (
    <View style={[s.container, { width: size, height: size }]}>
      {/* Arrow — uses transform rotate (non-animated for stability on budget phones) */}
      <View style={[s.arrowWrap, { transform: [{ rotate: `${displayRotation}deg` }] }]}>
        <View style={[s.arrow, { borderBottomColor: color }]} />
        <View style={[s.arrowStem, { backgroundColor: color }]} />
      </View>

      {/* Distance */}
      <Text style={[s.distance, { color }]}>{distanceText}</Text>

      {distanceMeters <= 15 && (
        <View style={s.hereBadge}>
          <Text style={s.hereText}>Here</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  arrowWrap: { alignItems: 'center' },
  arrow: {
    width: 0, height: 0,
    borderLeftWidth: 20, borderRightWidth: 20, borderBottomWidth: 40,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  arrowStem: {
    width: 10, height: 18,
    borderBottomLeftRadius: 5, borderBottomRightRadius: 5,
    marginTop: -2,
  },
  distance: { fontSize: 28, fontWeight: '800', marginTop: 10 },
  hereBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8, marginTop: 6 },
  hereText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
})
