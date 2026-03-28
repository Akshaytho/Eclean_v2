import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { MapPin, Clock, IndianRupee } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { Task, TaskStatus } from '../../types'
import { formatMoney } from '../../utils/formatMoney'
import { timeAgo } from '../../utils/timeAgo'

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  OPEN:        { label: 'Open',        color: COLORS.brand.primary,  bg: COLORS.brand.tint },
  ACCEPTED:    { label: 'Accepted',    color: '#3B82F6',              bg: '#EFF6FF' },
  IN_PROGRESS: { label: 'In Progress', color: '#F59E0B',              bg: '#FFFBEB' },
  SUBMITTED:   { label: 'Submitted',   color: '#8B5CF6',              bg: '#F5F3FF' },
  VERIFIED:    { label: 'Verified',    color: COLORS.brand.primary,   bg: COLORS.brand.tint },
  APPROVED:    { label: 'Approved',    color: COLORS.brand.primary,   bg: COLORS.brand.tint },
  REJECTED:    { label: 'Rejected',    color: COLORS.status.error,    bg: '#FEF2F2' },
  DISPUTED:    { label: 'Disputed',    color: '#F59E0B',              bg: '#FFFBEB' },
  CANCELLED:   { label: 'Cancelled',   color: COLORS.neutral[400],    bg: COLORS.neutral[100] },
  COMPLETED:   { label: 'Completed',   color: COLORS.brand.primary,   bg: COLORS.brand.tint },
}

interface TaskCardProps {
  task:     Task
  onPress:  () => void
  showRate?: boolean
}

export function TaskCard({ task, onPress, showRate = true }: TaskCardProps) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.OPEN

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      {/* Header row */}
      <View style={s.header}>
        <Text style={s.title} numberOfLines={1}>{task.title}</Text>
        <View style={[s.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Description */}
      <Text style={s.desc} numberOfLines={2}>{task.description}</Text>

      {/* Footer row */}
      <View style={s.footer}>
        {task.locationAddress ? (
          <View style={s.meta}>
            <MapPin size={12} color={COLORS.neutral[400]} />
            <Text style={s.metaText} numberOfLines={1}>{task.locationAddress}</Text>
          </View>
        ) : null}
        <View style={s.metaRight}>
          <View style={s.meta}>
            <Clock size={12} color={COLORS.neutral[400]} />
            <Text style={s.metaText}>{timeAgo(task.createdAt)}</Text>
          </View>
          {showRate && (
            <View style={s.rate}>
              <IndianRupee size={12} color={COLORS.brand.primary} />
              <Text style={s.rateText}>{formatMoney(task.rateCents)}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card:      { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 10, elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:     { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.neutral[900], marginRight: 8 },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  desc:      { fontSize: 13, color: COLORS.neutral[500], lineHeight: 18, marginBottom: 12 },
  footer:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta:      { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaText:  { fontSize: 12, color: COLORS.neutral[400], flex: 1 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rate:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rateText:  { fontSize: 13, fontWeight: '700', color: COLORS.brand.primary },
})
