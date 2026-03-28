import React, { useEffect, useState } from 'react'
import { Text, StyleSheet, TextStyle } from 'react-native'
import { COLORS } from '../../constants/colors'

interface TaskTimerProps {
  startedAt:  string | null // ISO timestamp from server
  style?:     TextStyle
  size?:      'sm' | 'md' | 'lg'
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
