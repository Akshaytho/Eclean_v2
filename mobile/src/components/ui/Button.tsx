import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import { COLORS } from '../../constants/colors'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  label:       string
  onPress:     () => void
  variant?:    Variant
  size?:       Size
  loading?:    boolean
  disabled?:   boolean
  fullWidth?:  boolean
  style?:      ViewStyle
  textStyle?:  TextStyle
}

export function Button({
  label,
  onPress,
  variant    = 'primary',
  size       = 'md',
  loading    = false,
  disabled   = false,
  fullWidth  = false,
  style,
  textStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#fff' : COLORS.brand.primary}
          size="small"
        />
      ) : (
        <Text style={[styles.text, styles[`text_${variant}`], styles[`text_${size}`], textStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
  },
  // variants
  primary: {
    backgroundColor: COLORS.brand.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth:     1.5,
    borderColor:     COLORS.brand.primary,
  },
  danger: {
    backgroundColor: COLORS.status.error,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  // sizes
  sm: { paddingVertical: 8,  paddingHorizontal: 16, borderRadius: 8 },
  md: { paddingVertical: 14, paddingHorizontal: 24 },
  lg: { paddingVertical: 18, paddingHorizontal: 32, borderRadius: 14 },
  // states
  disabled: { opacity: 0.5 },
  fullWidth: { width: '100%' },
  // text base
  text: { fontWeight: '600' },
  text_primary:   { color: '#fff' },
  text_secondary: { color: COLORS.brand.primary },
  text_danger:    { color: '#fff' },
  text_ghost:     { color: COLORS.brand.primary },
  text_sm: { fontSize: 13 },
  text_md: { fontSize: 15 },
  text_lg: { fontSize: 17 },
})
