import React from 'react'
import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import { COLORS } from '../../constants/colors'
import { Button } from './Button'

interface EmptyStateProps {
  emoji:       string
  title:       string
  subtitle?:   string
  actionLabel?: string
  onAction?:   () => void
  style?:      ViewStyle
}

export function EmptyState({ emoji, title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[s.container, style]}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          style={s.btn}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        40,
  },
  emoji:    { fontSize: 56, marginBottom: 16 },
  title:    { fontSize: 18, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.neutral[400], textAlign: 'center', marginTop: 8, lineHeight: 20 },
  btn:      { marginTop: 24, paddingHorizontal: 32 },
})
