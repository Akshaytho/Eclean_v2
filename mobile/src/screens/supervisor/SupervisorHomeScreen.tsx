/**
 * SupervisorHomeScreen
 * Backend: GET /api/v1/zones
 * Shows: zone list with dirty level indicators + tap to inspect
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { MapPin, Clock, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EmptyState }   from '../../components/ui/EmptyState'
import { zonesApi }     from '../../api/zones.api'
import { timeAgo }      from '../../utils/timeAgo'
import { COLORS }       from '../../constants/colors'
import type { Zone, DirtyLevel } from '../../types'

const DIRTY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  LIGHT:    { label: 'Light',    color: '#2E8B57', bg: '#E8F5EE', icon: <CheckCircle  size={14} color="#2E8B57" /> },
  MEDIUM:   { label: 'Medium',   color: '#F59E0B', bg: '#FFFBEB', icon: <AlertTriangle size={14} color="#F59E0B" /> },
  HEAVY:    { label: 'Heavy',    color: '#EF4444', bg: '#FEF2F2', icon: <AlertTriangle size={14} color="#EF4444" /> },
  CRITICAL: { label: 'Critical', color: '#991B1B', bg: '#FEE2E2', icon: <AlertTriangle size={14} color="#991B1B" /> },
}

export function SupervisorHomeScreen() {
  const navigation = useNavigation<any>()
  const insets     = useSafeAreaInsets()

  const { data: zones, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['zones'],
    queryFn:  () => zonesApi.list(),
    staleTime: 60_000,
  })

  const allZones = zones ?? []
  const criticalCount = allZones.filter(z => z.dirtyLevel === 'CRITICAL' || z.dirtyLevel === 'HEAVY').length

  const renderItem = ({ item }: { item: Zone }) => {
    const cfg = item.dirtyLevel ? DIRTY_CONFIG[item.dirtyLevel] : null

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => navigation.navigate('ZoneDetail', { zoneId: item.id })}
        activeOpacity={0.8}
      >
        {/* Left: dirty level strip */}
        <View style={[s.strip, { backgroundColor: cfg?.color ?? COLORS.neutral[200] }]} />

        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.zoneName}>{item.name}</Text>
              {item.city && <Text style={s.zoneCity}>{item.city}</Text>}
            </View>
            {cfg && (
              <View style={[s.levelBadge, { backgroundColor: cfg.bg }]}>
                {cfg.icon}
                <Text style={[s.levelText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            )}
          </View>

          <View style={s.cardMeta}>
            {item.lastInspectedAt ? (
              <View style={s.metaItem}>
                <Clock size={12} color={COLORS.neutral[400]} />
                <Text style={s.metaText}>Inspected {timeAgo(item.lastInspectedAt)}</Text>
              </View>
            ) : (
              <View style={s.metaItem}>
                <Clock size={12} color={COLORS.neutral[400]} />
                <Text style={s.metaText}>Never inspected</Text>
              </View>
            )}
          </View>
        </View>

        <ChevronRight size={18} color={COLORS.neutral[300]} />
      </TouchableOpacity>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.headerTitle}>Zones</Text>
        <Text style={s.headerSub}>
          {allZones.length} zones
          {criticalCount > 0 ? ` · ${criticalCount} need attention` : ' · all clear'}
        </Text>
      </View>

      {/* Summary pills */}
      {!isLoading && allZones.length > 0 && (
        <View style={s.summaryRow}>
          {(['LIGHT','MEDIUM','HEAVY','CRITICAL'] as DirtyLevel[]).map(level => {
            const count = allZones.filter(z => z.dirtyLevel === level).length
            if (count === 0) return null
            const cfg = DIRTY_CONFIG[level]
            return (
              <View key={level} style={[s.summaryPill, { backgroundColor: cfg.bg }]}>
                <Text style={[s.summaryCount, { color: cfg.color }]}>{count}</Text>
                <Text style={[s.summaryLabel, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            )
          })}
        </View>
      )}

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.brand.primary} size="large" /></View>
      ) : (
        <FlatList
          data={allZones}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={COLORS.brand.primary} />
          }
          ListEmptyComponent={
            <EmptyState emoji="🗺️" title="No zones assigned" subtitle="Zones will appear here once assigned by admin" />
          }
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:  { fontSize: 24, fontWeight: '800', color: COLORS.neutral[900] },
  headerSub:    { fontSize: 13, color: COLORS.neutral[400], marginTop: 2 },
  summaryRow:   { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  summaryPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryCount: { fontSize: 14, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:         { padding: 16, paddingBottom: 40 },
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, paddingRight: 14 },
  strip:        { width: 4, alignSelf: 'stretch' },
  cardBody:     { flex: 1, padding: 14 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  zoneName:     { fontSize: 16, fontWeight: '700', color: COLORS.neutral[900] },
  zoneCity:     { fontSize: 12, color: COLORS.neutral[400], marginTop: 2 },
  levelBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  levelText:    { fontSize: 11, fontWeight: '700' },
  cardMeta:     { flexDirection: 'row', gap: 12 },
  metaItem:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:     { fontSize: 12, color: COLORS.neutral[400] },
})
