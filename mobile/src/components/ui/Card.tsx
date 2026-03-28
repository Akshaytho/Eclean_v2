import React from 'react'
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native'
import { COLORS } from '../../constants/colors'

interface CardProps {
  children:   React.ReactNode
  style?:     ViewStyle
  onPress?:   () => void
  padding?:   number
  disabled?:  boolean
}

export function Card({ children, style, onPress, padding = 16, disabled }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[s.card, { padding }, style]}
        onPress={onPress}
        activeOpacity={0.75}
        disabled={disabled}
      >
        {children}
      </TouchableOpacity>
    )
  }
  return (
    <View style={[s.card, { padding }, style]}>
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius:    16,
    shadowColor:     COLORS.shadow,
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   1,
    shadowRadius:    8,
    elevation:       3,
  },
})
