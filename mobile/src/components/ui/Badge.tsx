import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '../../constants/colors'
import type { TaskStatus } from '../../types'

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string; label: string }> = {
  OPEN:        { bg: '#E3F2FD', text: '#1565C0', label: 'Open' },
  ACCEPTED:    { bg: '#F3E5F5', text: '#6A1B9A', label: 'Accepted' },
  IN_PROGRESS: { bg: '#E8F5E9', text: '#2E7D32', label: 'In Progress' },
  SUBMITTED:   { bg: '#FFF8E1', text: '#E65100', label: 'Submitted' },
  VERIFIED:    { bg: '#E8EAF6', text: '#283593', label: 'AI Verified' },
  APPROVED:    { bg: '#E8F5E9', text: '#1B5E20', label: 'Approved' },
  COMPLETED:   { bg: '#E8F5E9', text: '#1B5E20', label: 'Completed' },
  REJECTED:    { bg: '#FFEBEE', text: '#B71C1C', label: 'Rejected' },
  DISPUTED:    { bg: '#FBE9E7', text: '#BF360C', label: 'Disputed' },
  CANCELLED:   { bg: '#F5F5F5', text: '#616161', label: 'Cancelled' },
}

interface BadgeProps {
  status: TaskStatus
  small?: boolean
}

export function StatusBadge({ status, small = false }: BadgeProps) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS['OPEN']
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: c.text }, small && styles.smallText]}>
        {c.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      20,
    alignSelf:         'flex-start',
  },
  text:      { fontSize: 13, fontWeight: '600' },
  small:     { paddingHorizontal: 8, paddingVertical: 2 },
  smallText: { fontSize: 11 },
})
