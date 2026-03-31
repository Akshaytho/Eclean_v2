/**
 * FindMyArrow — iPhone Find My style direction arrow.
 *
 * Points toward a target GPS coordinate. Rotates in real-time
 * as the phone turns. No text, no map — just arrow + distance number.
 *
 * Uses:
 * - expo-location compass heading (which direction phone faces)
 * - Bearing calculation (angle from worker to target)
 * - Arrow rotation = bearing - heading
 *
 * Universal — works for illiterate workers, no translation needed.
 */

import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import * as Location from 'expo-location'
import { WORKER_THEME as W } from '../../constants/workerTheme'

interface FindMyArrowProps {
  targetLat: number
  targetLng: number
  workerLat: number
  workerLng: number
  /** Distance in meters from worker to target */
  distanceMeters: number
  /** Size of the arrow container */
  size?: number
}

// Calculate bearing from point A to point B (in degrees, 0=North, 90=East)
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

  const bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

export function FindMyArrow({
  targetLat, targetLng, workerLat, workerLng,
  distanceMeters, size = 120,
}: FindMyArrowProps) {
  const [heading, setHeading] = useState(0)
  const rotateAnim = useRef(new Animated.Value(0)).current

  // Subscribe to compass heading
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null

    ;(async () => {
      try {
        sub = await Location.watchHeadingAsync((data) => {
          if (data.trueHeading >= 0) {
            setHeading(data.trueHeading)
          } else if (data.magHeading >= 0) {
            setHeading(data.magHeading)
          }
        })
      } catch {
        // Compass not available — arrow won't rotate but still shows distance
      }
    })()

    return () => { sub?.remove() }
  }, [])

  // Calculate arrow rotation: bearing to target minus phone heading
  const bearing = calculateBearing(workerLat, workerLng, targetLat, targetLng)
  const rotation = bearing - heading

  // Animate rotation smoothly
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: rotation,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start()
  }, [rotation])

  const spin = rotateAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  })

  // Color based on distance
  const color = distanceMeters <= 15 ? W.primary     // Green — at the spot
    : distanceMeters <= 50 ? W.secondary              // Orange — getting close
    : '#EF4444'                                       // Red — far away

  const distanceText = distanceMeters < 1000
    ? `${Math.round(distanceMeters)}m`
    : `${(distanceMeters / 1000).toFixed(1)}km`

  return (
    <View style={[s.container, { width: size, height: size }]}>
      {/* Rotating arrow */}
      <Animated.View style={[s.arrowWrap, { transform: [{ rotate: spin }] }]}>
        <View style={[s.arrow, { borderBottomColor: color }]} />
        <View style={[s.arrowStem, { backgroundColor: color }]} />
      </Animated.View>

      {/* Distance number (doesn't rotate) */}
      <Text style={[s.distance, { color }]}>{distanceText}</Text>

      {/* Status hint */}
      {distanceMeters <= 15 && (
        <View style={s.atSpotBadge}>
          <Text style={s.atSpotText}>Here</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowWrap: {
    alignItems: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderBottomWidth: 36,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowStem: {
    width: 8,
    height: 16,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    marginTop: -2,
  },
  distance: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
  },
  atSpotBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  atSpotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
})
