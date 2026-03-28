import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Sparkles, ThumbsUp, ThumbsDown, AlertTriangle, HelpCircle } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'

type ScoreLabel = 'EXCELLENT' | 'GOOD' | 'UNCERTAIN' | 'POOR'

function getLabel(score: number): ScoreLabel {
  if (score >= 0.85) return 'EXCELLENT'
  if (score >= 0.65) return 'GOOD'
  if (score >= 0.45) return 'UNCERTAIN'
  return 'POOR'
}

const LABEL_CONFIG: Record<ScoreLabel, {
  color:   string
  bg:      string
  border:  string
  icon:    React.ReactNode
  text:    string
}> = {
  EXCELLENT: {
    color:  '#059669',
    bg:     '#ECFDF5',
    border: '#6EE7B7',
    icon:   <ThumbsUp size={14} color="#059669" />,
    text:   'Excellent work — AI verified',
  },
  GOOD: {
    color:  COLORS.brand.primary,
    bg:     COLORS.brand.tint,
    border: '#86EFAC',
    icon:   <ThumbsUp size={14} color={COLORS.brand.primary} />,
    text:   'Good quality — AI approved',
  },
  UNCERTAIN: {
    color:  '#D97706',
    bg:     '#FFFBEB',
    border: '#FCD34D',
    icon:   <AlertTriangle size={14} color="#D97706" />,
    text:   'AI uncertain — review carefully',
  },
  POOR: {
    color:  COLORS.status.error,
    bg:     '#FEF2F2',
    border: '#FCA5A5',
    icon:   <ThumbsDown size={14} color={COLORS.status.error} />,
    text:   'Low score — consider rejecting',
  },
}

interface AIScoreCardProps {
  score:      number        // 0.0 - 1.0 from backend
  reasoning?: string | null
}

export function AIScoreCard({ score, reasoning }: AIScoreCardProps) {
  const label = getLabel(score)
  const cfg   = LABEL_CONFIG[label]
  const pct   = Math.round(score * 100)

  return (
    <View style={[s.card, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.titleRow}>
          <Sparkles size={14} color={cfg.color} />
          <Text style={[s.title, { color: cfg.color }]}>AI Verification</Text>
        </View>
        <View style={[s.badge, { backgroundColor: cfg.color }]}>
          {cfg.icon}
          <Text style={s.badgeText}>{label}</Text>
        </View>
      </View>

      {/* Score bar */}
      <View style={s.barRow}>
        <View style={s.barBg}>
          <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: cfg.color }]} />
        </View>
        <Text style={[s.score, { color: cfg.color }]}>{pct}%</Text>
      </View>

      {/* Recommendation */}
      <Text style={[s.recommend, { color: cfg.color }]}>{cfg.text}</Text>

      {/* AI reasoning */}
      {reasoning && (
        <View style={s.reasoningBox}>
          <HelpCircle size={12} color={COLORS.neutral[400]} />
          <Text style={s.reasoningText}>{reasoning}</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card:        { borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 16 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:       { fontSize: 13, fontWeight: '700' },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  barRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  barBg:       { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  barFill:     { height: 8, borderRadius: 4 },
  score:       { fontSize: 18, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  recommend:   { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  reasoningBox:{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.07)' },
  reasoningText:{ flex: 1, fontSize: 12, color: COLORS.neutral[500], lineHeight: 17 },
})
