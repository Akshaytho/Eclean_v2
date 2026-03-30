/**
 * useEnvironmentalDNA — Passive multi-sensor location fingerprint.
 *
 * Captures in ~2 seconds, zero user interaction:
 * - Magnetometer XYZ (unique per building due to rebar/metal)
 * - Barometric pressure (altitude / indoor-outdoor detection)
 * - Ambient light level (indoor vs outdoor indicator)
 * - Cell network type + carrier
 *
 * WiFi scanning requires native module on Android — deferred to v2.
 *
 * Usage:
 *   const { capture } = useEnvironmentalDNA()
 *   const envDNA = await capture() // returns EnvironmentalDNA or null
 */

import { useCallback } from 'react'
import { Magnetometer, Barometer } from 'expo-sensors'
import * as Brightness from 'expo-brightness'
import NetInfo from '@react-native-community/netinfo'

export interface EnvironmentalDNA {
  magX: number | null
  magY: number | null
  magZ: number | null
  barometer: number | null
  ambientLight: number | null
  cellType: string | null
  cellCarrier: string | null
  wifiNetworks: string | null  // JSON — null until WiFi scanning ships
  capturedAt: string
}

async function readMagnetometer(): Promise<{ x: number; y: number; z: number } | null> {
  try {
    const available = await Magnetometer.isAvailableAsync()
    if (!available) return null

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        sub.remove()
        resolve(null)
      }, 2000)

      const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
        clearTimeout(timeout)
        sub.remove()
        resolve(data)
      })
      Magnetometer.setUpdateInterval(200)
    })
  } catch {
    return null
  }
}

async function readBarometer(): Promise<number | null> {
  try {
    const available = await Barometer.isAvailableAsync()
    if (!available) return null

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        sub.remove()
        resolve(null)
      }, 2000)

      const sub = Barometer.addListener((data: { pressure: number; relativeAltitude?: number }) => {
        clearTimeout(timeout)
        sub.remove()
        resolve(data.pressure)
      })
    })
  } catch {
    return null
  }
}

async function readAmbientLight(): Promise<number | null> {
  try {
    const brightness = await Brightness.getBrightnessAsync()
    return brightness // 0-1 normalized
  } catch {
    return null
  }
}

async function readCellInfo(): Promise<{ type: string | null; carrier: string | null }> {
  try {
    const netInfo = await NetInfo.fetch()
    return {
      type: netInfo.type ?? null,
      carrier: null, // carrier info requires native module — deferred
    }
  } catch {
    return { type: null, carrier: null }
  }
}

export function useEnvironmentalDNA() {
  const capture = useCallback(async (): Promise<EnvironmentalDNA> => {
    // Parallel capture — all sensors at once, ~2 seconds max
    const [mag, baro, light, cell] = await Promise.all([
      readMagnetometer(),
      readBarometer(),
      readAmbientLight(),
      readCellInfo(),
    ])

    return {
      magX: mag?.x ?? null,
      magY: mag?.y ?? null,
      magZ: mag?.z ?? null,
      barometer: baro,
      ambientLight: light,
      cellType: cell.type,
      cellCarrier: cell.carrier,
      wifiNetworks: null, // WiFi scanning deferred — requires native module
      capturedAt: new Date().toISOString(),
    }
  }, [])

  return { capture }
}
