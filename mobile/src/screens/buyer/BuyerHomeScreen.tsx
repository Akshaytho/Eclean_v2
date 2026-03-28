import React, { useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { PlusCircle, ChevronRight, Clock, CheckCircle, AlertCircle } from 'lucide-react-native'
import { LinearGradient } from '../../components/LinearGradientShim'
import { ScreenWrapper }  from '../../components/layout/ScreenWrapper'
import { StatusBadge }    from '../../components/ui/Badge'
import { COLORS }         from '../../constants/colors'
import { buyerTasksApi }  from '../../api/tasks.api'
import { authApi }         from '../../api/auth.api'
import { useAuthStore }   from '../../stores/authStore'
import { formatMoney }    from '../../utils/formatMoney'
import { timeAgo }        from '../../utils/timeAgo'
import type { BuyerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<BuyerStackParamList>

export function BuyerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user }   = useAuthStore()

  const activeQuery = useQuery({
    queryKey: ['buyer-tasks-active'],
    queryFn:  () => buyerTasksApi.listTasks({ status: 'OPEN,ACCEPTED,IN_PROGRESS,SUBMITTED,VERIFIED', page: 1, limit: 5 }),
    staleTime: 15_000,
  })

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn:  authApi.me,
    staleTime: 60_000,
  })
  const totalSpent = meQuery.data?.buyerProfile?.totalSpentCents ?? 0

  const tasks  = activeQuery.data?.tasks ?? []
  const active = tasks.filter(t => ['ACCEPTED', 'IN_PROGRESS'].includes(t.status))
  const pending = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'VERIFIED')

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={activeQuery.isFetching} onRefresh={activeQuery.refetch} tintColor={COLORS.brand.primary} />
        }
      >
        {/* Header */}
        <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={s.header}>
          <Text style={s.greeting}>Hello, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={s.sub}>Manage your cleaning tasks</Text>
          <TouchableOpacity
            style={s.postBtn}
            onPress={() => (navigation as any).navigate('PostTask')}
            activeOpacity={0.85}
          >
            <PlusCircle size={18} color={COLORS.brand.primary} />
            <Text style={s.postBtnText}>Post New Task</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatCard label="Active"  value={active.length}  color={COLORS.brand.primary} />
          <StatCard label="Review"  value={pending.length} color="#D97706" />
          <StatCard label="Spent"   value={totalSpent} color="#8B5CF6" isRupees />
        </View>

        {/* Active tasks */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Active Tasks</Text>
            <TouchableOpacity onPress={() => (navigation as any).navigate('BuyerTasks')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {activeQuery.isLoading
            ? <ActivityIndicator color={COLORS.brand.primary} style={{ marginTop: 20 }} />
            : tasks.length === 0
              ? <EmptyState onPost={() => (navigation as any).navigate('PostTask')} />
              : tasks.map(task => (
                <TouchableOpacity
                  key={task.id}
                  style={s.taskCard}
                  onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                  activeOpacity={0.8}
                >
                  <View style={s.taskCardTop}>
                    <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
                    <StatusBadge status={task.status} small />
                  </View>
                  <View style={s.taskCardMeta}>
                    <Text style={s.taskPrice}>{formatMoney(task.rateCents)}</Text>
                    <Text style={s.taskTime}>{timeAgo(task.updatedAt)}</Text>
                  </View>
                  {task.status === 'SUBMITTED' && (
                    <View style={s.reviewBanner}>
                      <AlertCircle size={14} color="#D97706" />
                      <Text style={s.reviewText}>Needs your review</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
          }
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenWrapper>
  )
}

function StatCard({ label, value, color, isRupees }: { label: string; value: number; color: string; isRupees?: boolean }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, { color }]}>{isRupees ? `₹${Math.floor(value/100)}` : value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function EmptyState({ onPost }: { onPost: () => void }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyEmoji}>📋</Text>
      <Text style={s.emptyTitle}>No active tasks</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={onPost}>
        <Text style={s.emptyBtnText}>Post your first task</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  header:      { paddingTop: 60, paddingBottom: 28, paddingHorizontal: 24 },
  greeting:    { fontSize: 22, fontWeight: '700', color: '#fff' },
  sub:         { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  postBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginTop: 20, alignSelf: 'flex-start' },
  postBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  statsRow:    { flexDirection: 'row', padding: 16, gap: 12 },
  statCard:    { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, alignItems: 'center', elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  statValue:   { fontSize: 26, fontWeight: '800' },
  statLabel:   { fontSize: 12, color: COLORS.neutral[500], marginTop: 2 },
  section:     { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.neutral[900] },
  seeAll:      { fontSize: 13, color: COLORS.brand.primary, fontWeight: '600' },
  taskCard:    { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  taskCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  taskTitle:   { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.neutral[900], marginRight: 8 },
  taskCardMeta:{ flexDirection: 'row', justifyContent: 'space-between' },
  taskPrice:   { fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  taskTime:    { fontSize: 12, color: COLORS.neutral[400] },
  reviewBanner:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  reviewText:  { fontSize: 12, fontWeight: '600', color: '#D97706' },
  empty:       { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyEmoji:  { fontSize: 48 },
  emptyTitle:  { fontSize: 16, fontWeight: '600', color: COLORS.neutral[700] },
  emptyBtn:    { backgroundColor: COLORS.brand.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
})
