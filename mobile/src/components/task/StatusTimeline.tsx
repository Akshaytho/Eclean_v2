import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { TaskStatus } from '../../types'

const STEPS: { status: TaskStatus; label: string }[] = [
  { status: 'OPEN',        label: 'Posted' },
  { status: 'ACCEPTED',    label: 'Accepted' },
  { status: 'IN_PROGRESS', label: 'Working' },
  { status: 'SUBMITTED',   label: 'Submitted' },
  { status: 'APPROVED',    label: 'Approved' },
]

const STATUS_ORDER: Partial<Record<TaskStatus, number>> = {
  OPEN:        0,
  ACCEPTED:    1,
  IN_PROGRESS: 2,
  SUBMITTED:   3,
  VERIFIED:    3,
  APPROVED:    4,
  COMPLETED:   4,
  REJECTED:    3,
  DISPUTED:    3,
  CANCELLED:   0,
}

interface StatusTimelineProps {
  status:    TaskStatus
  updatedAt?: string
}

export function StatusTimeline({ status }: StatusTimelineProps) {
  const currentIdx = STATUS_ORDER[status] ?? 0
  const isRejected = status === 'REJECTED'
  const isCancelled = status === 'CANCELLED'

  return (
    <View style={s.container}>
      {STEPS.map((step, idx) => {
        const done    = idx < currentIdx
        const active  = idx === currentIdx && !isRejected && !isCancelled
        const failed  = isRejected && idx === currentIdx
        const isLast  = idx === STEPS.length - 1

        const dotColor = done
          ? COLORS.brand.primary
          : active
          ? COLORS.brand.primary
          : failed
          ? COLORS.status.error
          : COLORS.neutral[200]

        const lineColor = done ? COLORS.brand.primary : COLORS.neutral[200]

        return (
          <View key={step.status} style={s.step}>
            {/* Dot */}
            <View style={s.dotCol}>
              <View style={[s.dot, { backgroundColor: dotColor, borderColor: active ? COLORS.brand.primary : 'transparent' }]}>
                {done && <Check size={10} color="#fff" strokeWidth={3} />}
                {active && <View style={s.activeDot} />}
              </View>
              {!isLast && <View style={[s.line, { backgroundColor: lineColor }]} />}
            </View>
            {/* Label */}
            <Text style={[
              s.label,
              done && s.labelDone,
              active && s.labelActive,
              failed && s.labelFailed,
            ]}>
              {failed ? 'Rejected' : step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  container:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  step:        { flex: 1, alignItems: 'center' },
  dotCol:      { alignItems: 'center' },
  dot:         { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: COLORS.neutral[200] },
  activeDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  line:        { width: 2, flex: 1, minHeight: 8, marginVertical: 2 },
  label:       { fontSize: 10, color: COLORS.neutral[400], marginTop: 4, textAlign: 'center', fontWeight: '500' },
  labelDone:   { color: COLORS.brand.primary },
  labelActive: { color: COLORS.brand.primary, fontWeight: '700' },
  labelFailed: { color: COLORS.status.error },
})
