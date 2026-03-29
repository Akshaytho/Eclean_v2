import React from 'react'
import { View, Text, Image, StyleSheet, ImageStyle } from 'react-native'
import { COLORS } from '../../constants/colors'

interface AvatarProps {
  name:     string
  photoUrl?: string | null
  size?:    number
  style?:   ImageStyle
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function getColor(name: string): string {
  const palette = [
    '#2E8B57', '#3B82F6', '#8B5CF6', '#EC4899',
    '#F59E0B', '#EF4444', '#10B981', '#6366F1',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return palette[Math.abs(hash) % palette.length]
}

export function Avatar({ name, photoUrl, size = 40, style }: AvatarProps) {
  const fontSize = size * 0.36
  const bg       = getColor(name)

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[s.base, { width: size, height: size, borderRadius: size / 2 }, style]}
      />
    )
  }

  return (
    <View style={[s.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }, style]}>
      <Text style={[s.initials, { fontSize }]}>{getInitials(name)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  base:     { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
})
