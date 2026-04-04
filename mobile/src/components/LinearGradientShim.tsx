/**
 * LinearGradient — re-export from expo-linear-gradient.
 *
 * PERF: GPU-accelerated native gradient vs plain View with solid backgroundColor.
 * On budget phones, GPU gradients render in <1ms vs View re-layout on every scroll.
 *
 * Previously this was a shim (plain View) because expo-linear-gradient v14 didn't
 * support Fabric. v15 (expo SDK 54) works with New Architecture — use the real thing.
 *
 * Fallback: if expo-linear-gradient fails to load (Expo Go without dev client),
 * gracefully degrade to solid color View.
 */
import React from 'react'
import { View, StyleSheet, type ViewStyle } from 'react-native'

let RealLinearGradient: React.ComponentType<any> | null = null
try {
  RealLinearGradient = require('expo-linear-gradient').LinearGradient
} catch {
  // expo-linear-gradient not available (Expo Go without dev client)
}

interface Props {
  colors: readonly string[] | string[]
  style?: ViewStyle | ViewStyle[] | any
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  children?: React.ReactNode
  [key: string]: any
}

export const LinearGradient: React.FC<Props> = ({ colors, style, children, ...rest }) => {
  if (RealLinearGradient) {
    return (
      <RealLinearGradient colors={colors} style={style} {...rest}>
        {children}
      </RealLinearGradient>
    )
  }

  // Fallback: solid color (Expo Go only)
  const bg = colors && colors.length > 0 ? colors[0] : '#1E293B'
  return (
    <View style={[StyleSheet.flatten(style), { backgroundColor: bg }]} {...rest}>
      {children}
    </View>
  )
}
