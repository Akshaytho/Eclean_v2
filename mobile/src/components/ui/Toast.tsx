import React, { useEffect } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { useToastStore, type Toast as ToastType } from '../../stores/toastStore'
import { COLORS } from '../../constants/colors'

const TOAST_COLORS = {
  success: { bg: '#E8F5E9', border: '#4CAF50', text: '#1B5E20' },
  error:   { bg: '#FFEBEE', border: COLORS.status.error, text: '#B71C1C' },
  info:    { bg: '#E3F2FD', border: COLORS.brand.primary, text: '#0D47A1' },
  warning: { bg: '#FFF8E1', border: '#FFC107', text: '#E65100' },
} as const

function ToastItem({ toast }: { toast: ToastType }) {
  const opacity = React.useRef(new Animated.Value(0)).current
  const c = TOAST_COLORS[toast.type]

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(toast.duration - 400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[styles.toast, { backgroundColor: c.bg, borderLeftColor: c.border, opacity }]}>
      <Text style={[styles.text, { color: c.text }]}>{toast.message}</Text>
    </Animated.View>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (!toasts.length) return null

  return (
    <View style={styles.container} pointerEvents="none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position:    'absolute',
    top:         60,
    left:        16,
    right:       16,
    zIndex:      9999,
    gap:         8,
  },
  toast: {
    borderLeftWidth: 4,
    borderRadius:    10,
    padding:         14,
    shadowColor:     '#000',
    shadowOpacity:   0.1,
    shadowRadius:    8,
    elevation:       4,
  },
  text: {
    fontSize:   14,
    fontWeight: '500',
  },
})
