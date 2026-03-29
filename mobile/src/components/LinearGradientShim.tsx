/**
 * LinearGradient shim — replaces expo-linear-gradient with a plain View.
 * expo-linear-gradient v14 doesn't register as a Fabric ViewManager in
 * the new RN architecture. For CI/E2E testing this is sufficient since
 * Maestro flows only test navigation, not visual gradients.
 */
import React from 'react'
import { View, ViewStyle, StyleSheet } from 'react-native'

interface Props {
  colors: readonly string[] | string[]
  style?: ViewStyle | ViewStyle[] | any
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  children?: React.ReactNode
  [key: string]: any
}

export const LinearGradient: React.FC<Props> = ({ colors, style, children, ...rest }) => {
  const bg = colors && colors.length > 0 ? colors[0] : '#0A2463'
  return (
    <View style={[StyleSheet.flatten(style), { backgroundColor: bg }]} {...rest}>
      {children}
    </View>
  )
}
