import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { COLORS } from '../../constants/colors'

interface SkeletonProps {
  width?:        number | string
  height?:       number
  borderRadius?: number
  style?:        ViewStyle
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        s.skeleton,
        { width: width as any, height, borderRadius, opacity },
        style,
      ]}
    />
  )
}

// Convenience preset: card skeleton
export function SkeletonCard() {
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Skeleton width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} width="40%" />
        </View>
      </View>
      <Skeleton height={12} style={{ marginTop: 12 }} />
      <Skeleton height={12} width="80%" style={{ marginTop: 6 }} />
    </View>
  )
}

const s = StyleSheet.create({
  skeleton: { backgroundColor: COLORS.neutral[200] },
  card:     { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12 },
  row:      { flexDirection: 'row', alignItems: 'center' },
})
