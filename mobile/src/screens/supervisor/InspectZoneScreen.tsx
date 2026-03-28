/**
 * InspectZoneScreen
 * Backend: PATCH /api/v1/zones/:id/inspect { dirtyLevel, note }
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { zonesApi }  from '../../api/zones.api'
import { COLORS }    from '../../constants/colors'
import type { SupervisorStackParamList } from '../../navigation/types'
import type { DirtyLevel } from '../../types'

type Route = RouteProp<SupervisorStackParamList, 'InspectZone'>

const LEVELS: { value: DirtyLevel; label: string; color: string; bg: string; desc: string }[] = [
  { value: 'LIGHT',    label: 'Light',    color: '#2E8B57', bg: '#E8F5EE', desc: 'Minor litter, superficial dirt' },
  { value: 'MEDIUM',   label: 'Medium',   color: '#F59E0B', bg: '#FFFBEB', desc: 'Noticeable waste, needs cleaning soon' },
  { value: 'HEAVY',    label: 'Heavy',    color: '#EF4444', bg: '#FEF2F2', desc: 'Significant waste accumulation' },
  { value: 'CRITICAL', label: 'Critical', color: '#991B1B', bg: '#FEE2E2', desc: 'Health/safety risk — immediate action needed' },
]

export function InspectZoneScreen() {
  const navigation = useNavigation<any>()
  const route      = useRoute<Route>()
  const { zoneId } = route.params
  const insets     = useSafeAreaInsets()
  const qc         = useQueryClient()

  const [level, setLevel] = useState<DirtyLevel | null>(null)
  const [note,  setNote]  = useState('')

  const mutation = useMutation({
    mutationFn: () => zonesApi.inspect(zoneId, level!, note.trim() || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zones'] })
      Alert.alert(
        'Inspection Saved ✓',
        level === 'MEDIUM' || level === 'HEAVY' || level === 'CRITICAL'
          ? 'A cleaning task has been automatically created for this zone.'
          : 'Zone inspection recorded successfully.',
        [{ text: 'Done', onPress: () => navigation.navigate('SupervisorTabs') }],
      )
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not save inspection')
    },
  })

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Inspect Zone</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Dirty level selector */}
        <View style={s.section}>
          <Text style={s.label}>Current Dirty Level <Text style={s.required}>*</Text></Text>
          <View style={s.levelsStack}>
            {LEVELS.map(l => (
              <TouchableOpacity
                key={l.value}
                style={[s.levelCard, level === l.value && { borderColor: l.color, backgroundColor: l.bg }]}
                onPress={() => setLevel(l.value)}
                activeOpacity={0.8}
              >
                <View style={[s.levelDot, { backgroundColor: l.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.levelLabel, level === l.value && { color: l.color }]}>{l.label}</Text>
                  <Text style={s.levelDesc}>{l.desc}</Text>
                </View>
                {level === l.value && (
                  <View style={[s.selectedMark, { backgroundColor: l.color }]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={s.section}>
          <Text style={s.label}>Notes (optional)</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. Blocked drain near school entrance, large garbage pile..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor={COLORS.neutral[400]}
          />
        </View>

        {/* Auto-task notice */}
        {(level === 'MEDIUM' || level === 'HEAVY' || level === 'CRITICAL') && (
          <View style={s.autoTaskNotice}>
            <Text style={s.autoTaskText}>
              ⚡ A cleaning task will be automatically created for this zone.
            </Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Submit footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[s.submitBtn, !level && s.submitBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!level || mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitText}>Save Inspection</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:          { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:      { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center' },
  section:          { paddingHorizontal: 20, marginTop: 24 },
  label:            { fontSize: 14, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 12 },
  required:         { color: COLORS.status.error },
  levelsStack:      { gap: 10 },
  levelCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: COLORS.border },
  levelDot:         { width: 12, height: 12, borderRadius: 6 },
  levelLabel:       { fontSize: 15, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 2 },
  levelDesc:        { fontSize: 12, color: COLORS.neutral[400], lineHeight: 17 },
  selectedMark:     { width: 8, height: 8, borderRadius: 4 },
  textInput:        { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 14, color: COLORS.neutral[900], minHeight: 100 },
  autoTaskNotice:   { marginHorizontal: 20, marginTop: 16, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A' },
  autoTaskText:     { fontSize: 13, color: '#92400E', lineHeight: 18 },
  footer:           { paddingHorizontal: 20, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn:        { backgroundColor: COLORS.brand.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  submitBtnDisabled:{ backgroundColor: COLORS.neutral[200] },
  submitText:       { fontSize: 16, fontWeight: '700', color: '#fff' },
})
