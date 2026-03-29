import React, { useEffect, useState } from 'react'
import { Text, StyleSheet, TextStyle } from 'react-native'
import { COLORS } from '../../constants/colors'
import { formatElapsed } from '../../utils/formatTime'

interface TaskTimerProps {
  startedAt:  string | null // ISO timestamp from server
  style?:     TextStyle
  size?:      'sm' | 'md' | 'lg'
}

export function TaskTimer({ startedAt, style, size = 'md' }: TaskTimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const startMs = new Date(startedAt).getTime()
    // Compute initial elapsed immediately
    setElapsed(Math.floor((Date.now() - startMs) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  if (!startedAt) return null

  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 28 : 20

  return (
    <Text style={[s.timer, { fontSize }, style]}>
      {formatElapsed(elapsed)}
    </Text>
  )
}

const s = StyleSheet.create({
  timer: {
    fontWeight:  '700',
    color:       COLORS.brand.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
})
