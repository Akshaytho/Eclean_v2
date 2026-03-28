/**
 * ZoneDetailScreen
 * Shows zone info + tasks in zone + Inspect button
 */
import React from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, AlertTriangle, Clock, ClipboardList, Wrench } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { zonesApi }     from '../../api/zones.api'
import { workerTasksApi } from '../../api/tasks.api'
import { timeAgo }      from '../../utils/timeAgo'
import { COLORS }       from '../../constants/colors'
import type { SupervisorStackParamList } from '../../navigation/types'

type Route = RouteProp<SupervisorStackParamList, 'ZoneDetail'>

const DIRTY_COLORS: Record<string, string> = {
  LIGHT: '#2E8B57', MEDIUM: '#F59E0B', HEAVY: '#EF4444', CRITICAL: '#991B1B',
}

export function ZoneDetailScreen() {
  const navigation = useNavigation<any>()
  const route      = useRoute<Route>()
  const { zoneId } = route.params
  const insets     = useSafeAreaInsets()

  const { data: zones, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn:  () => zonesApi.list(),
    staleTime: 60_000,
  })

  const zone = (zones ?? []).find(z => z.id === zoneId)

  if (isLoading || !zone) {
    return <View style={s.center}><ActivityIndicator color={COLORS.brand.primary} size="large" /></View>
  }

  const dirtyColor = zone.dirtyLevel ? DIRTY_COLORS[zone.dirtyLevel] : COLORS.neutral[300]

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{zone.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Dirty level card */}
        <View style={[s.levelCard, { borderColor: dirtyColor }]}>
          <AlertTriangle size={24} color={dirtyColor} />
          <View style={{ flex: 1 }}>
            <Text style={s.levelTitle}>Current Dirty Level</Text>
            <Text style={[s.levelValue, { color: dirtyColor }]}>
              {zone.dirtyLevel ?? 'Not inspected'}
            </Text>
          </View>
          {zone.lastInspectedAt && (
            <View style={s.lastInspected}>
              <Clock size={12} color={COLORS.neutral[400]} />
              <Text style={s.lastInspectedText}>{timeAgo(zone.lastInspectedAt)}</Text>
            </View>
          )}
        </View>

        {/* Zone info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Zone Info</Text>
          <View style={s.card}>
            {zone.city && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>City</Text>
                <Text style={s.infoValue}>{zone.city}</Text>
              </View>
            )}
            {zone.radiusMeters && (
              <>
                <View style={s.divider} />
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Coverage</Text>
                  <Text style={s.infoValue}>{(zone.radiusMeters / 1000).toFixed(1)} km radius</Text>
                </View>
              </>
            )}
            <View style={s.divider} />
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Last Inspected</Text>
              <Text style={s.infoValue}>
                {zone.lastInspectedAt ? timeAgo(zone.lastInspectedAt) : 'Never'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Inspect button */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={s.inspectBtn}
          onPress={() => navigation.navigate('InspectZone', { zoneId })}
          activeOpacity={0.85}
        >
          <Wrench size={20} color="#fff" />
          <Text style={s.inspectBtnText}>Inspect This Zone</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  center:              { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:             { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:         { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center' },
  levelCard:           { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 20, padding: 20, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 2, elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  levelTitle:          { fontSize: 12, color: COLORS.neutral[400], fontWeight: '600', marginBottom: 4 },
  levelValue:          { fontSize: 20, fontWeight: '800' },
  lastInspected:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastInspectedText:   { fontSize: 11, color: COLORS.neutral[400] },
  section:             { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle:        { fontSize: 11, fontWeight: '700', color: COLORS.neutral[400], letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  card:                { backgroundColor: COLORS.surface, borderRadius: 16, paddingHorizontal: 16 },
  infoRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  infoLabel:           { fontSize: 14, color: COLORS.neutral[500] },
  infoValue:           { fontSize: 14, fontWeight: '600', color: COLORS.neutral[900] },
  divider:             { height: 1, backgroundColor: COLORS.neutral[100] },
  footer:              { paddingHorizontal: 20, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  inspectBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.brand.primary, borderRadius: 14, padding: 16 },
  inspectBtnText:      { fontSize: 16, fontWeight: '700', color: '#fff' },
})
