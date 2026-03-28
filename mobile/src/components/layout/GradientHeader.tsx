import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from '../LinearGradientShim'
import { COLORS } from '../../constants/colors'

interface GradientHeaderProps {
  title:         string
  subtitle?:     string
  leftIcon?:     React.ReactNode
  rightIcon?:    React.ReactNode
  onLeftPress?:  () => void
  onRightPress?: () => void
  style?:        ViewStyle
  minHeight?:    number
  children?:     React.ReactNode
}

export function GradientHeader({
  title,
  subtitle,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  style,
  minHeight = 120,
  children,
}: GradientHeaderProps) {
  const insets = useSafeAreaInsets()

  return (
    <LinearGradient
      colors={[COLORS.brand.dark, COLORS.brand.primary]}
      style={[s.gradient, { paddingTop: insets.top + 12, minHeight: minHeight + insets.top }, style]}
    >
      <View style={s.row}>
        {leftIcon ? (
          <TouchableOpacity onPress={onLeftPress} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {leftIcon}
          </TouchableOpacity>
        ) : <View style={s.iconPlaceholder} />}

        <View style={s.center}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>

        {rightIcon ? (
          <TouchableOpacity onPress={onRightPress} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {rightIcon}
          </TouchableOpacity>
        ) : <View style={s.iconPlaceholder} />}
      </View>

      {children && <View style={s.children}>{children}</View>}
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  gradient:        { paddingHorizontal: 20, paddingBottom: 20 },
  row:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center:          { flex: 1, alignItems: 'center' },
  title:           { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  subtitle:        { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  iconBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconPlaceholder: { width: 40 },
  children:        { marginTop: 16 },
})
