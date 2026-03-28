/**
 * CitizenHomeScreen
 * Backend: GET /api/v1/citizen/reports
 * Shows: report list with status + FAB to create new report
 */
import React from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { Plus, MapPin, Clock, CheckCircle, AlertCircle, Circle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenWrapper }  from '../../components/layout/ScreenWrapper'
import { EmptyState }     from '../../components/ui/EmptyState'
import { citizenApi }     from '../../api/citizen.api'
import { timeAgo }        from '../../utils/timeAgo'
import { COLORS }         from '../../constants/colors'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:    { label: 'Pending',    color: '#F59E0B', icon: <Clock     size={12} color="#F59E0B" /> },
  REVIEWED:   { label: 'Reviewed',  color: '#3B82F6', icon: <AlertCircle size={12} color="#3B82F6" /> },
  ASSIGNED:   { label: 'Assigned',  color: '#8B5CF6', icon: <Circle    size={12} color="#8B5CF6" /> },
  RESOLVED:   { label: 'Resolved',  color: '#2E8B57', icon: <CheckCircle size={12} color="#2E8B57" /> },
}

const URGENCY_COLORS: Record<string, string> = {
  LOW: '#9E968A', MEDIUM: '#F59E0B', HIGH: '#EF4444', URGENT: '#DC2626', CRITICAL: '#991B1B',
}

export function CitizenHomeScreen() {
  const navigation = useNavigation<any>()
  const insets     = useSafeAreaInsets()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['citizen-reports'],
    queryFn:  citizenApi.listReports,
    staleTime: 30_000,
  })

  const reports = (data as any)?.reports ?? data ?? []

  const renderItem = ({ item }: { item: any }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDING
    return (
      <View style={s.card}>
        {/* Urgency strip */}
        <View style={[s.urgencyStrip, { backgroundColor: URGENCY_COLORS[item.urgency] ?? COLORS.neutral[300] }]} />

        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={s.cardTitle} numberOfLines={2}>{item.description}</Text>
            <View style={[s.statusBadge, { backgroundColor: cfg.color + '18' }]}>
              {cfg.icon}
              <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          <View style={s.cardMeta}>
            <View style={s.metaItem}>
              <MapPin size={12} color={COLORS.neutral[400]} />
              <Text style={s.metaText} numberOfLines={1}>
                {item.locationAddress ?? `${item.lat?.toFixed(4)}, ${item.lng?.toFixed(4)}`}
              </Text>
            </View>
            <View style={s.metaItem}>
              <Clock size={12} color={COLORS.neutral[400]} />
              <Text style={s.metaText}>{timeAgo(item.createdAt)}</Text>
            </View>
          </View>

          <View style={s.categoryRow}>
            <Text style={s.categoryText}>{item.category?.replace(/_/g, ' ')}</Text>
            <View style={[s.urgencyPill, { backgroundColor: URGENCY_COLORS[item.urgency] + '20' }]}>
              <Text style={[s.urgencyText, { color: URGENCY_COLORS[item.urgency] }]}>
                {item.urgency}
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.headerTitle}>My Reports</Text>
        <Text style={s.headerSub}>{reports.length} report{reports.length !== 1 ? 's' : ''} submitted</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.brand.primary} size="large" /></View>
      ) : (
        <FlatList
          data={reports}
          renderItem={renderItem}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={COLORS.brand.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              emoji="📍"
              title="No reports yet"
              subtitle="Report dirty areas in your neighbourhood and help keep your city clean"
              actionLabel="Report a Problem"
              onAction={() => navigation.navigate('CreateReport')}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => navigation.navigate('CreateReport')}
        activeOpacity={0.85}
      >
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.neutral[900] },
  headerSub:   { fontSize: 13, color: COLORS.neutral[400], marginTop: 2 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { padding: 16, paddingBottom: 100 },
  card:        { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 16, marginBottom: 12, overflow: 'hidden', elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  urgencyStrip:{ width: 4 },
  cardBody:    { flex: 1, padding: 14 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  cardTitle:   { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.neutral[900], lineHeight: 20 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  cardMeta:    { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metaItem:    { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  metaText:    { fontSize: 11, color: COLORS.neutral[400], flex: 1 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryText:{ fontSize: 11, fontWeight: '600', color: COLORS.neutral[500], textTransform: 'uppercase', letterSpacing: 0.5 },
  urgencyPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  urgencyText: { fontSize: 10, fontWeight: '700' },
  fab:         { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.brand.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: COLORS.brand.dark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
})
