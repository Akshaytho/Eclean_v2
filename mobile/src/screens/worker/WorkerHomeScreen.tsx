/**
 * WorkerHomeScreen
 * Backend connections:
 *   GET /api/v1/auth/me               → workerProfile.rating, completedTasks, isAvailable
 *   GET /api/v1/worker/my-tasks       → active + accepted tasks
 *   PATCH /api/v1/worker/availability → toggle isAvailable
 *   GET /api/v1/worker/wallet         → earnings
 */
import React from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Switch,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { MapPin, Star, CheckCircle, AlertCircle, Wallet } from 'lucide-react-native'
import { LinearGradient } from '../../components/LinearGradientShim'
import { ScreenWrapper }   from '../../components/layout/ScreenWrapper'
import { StatusBadge }     from '../../components/ui/Badge'
import { COLORS }          from '../../constants/colors'
import { workerTasksApi }  from '../../api/tasks.api'
import { authApi }         from '../../api/auth.api'
import { apiClient }       from '../../api/client'
import { useAuthStore }    from '../../stores/authStore'
import { DashboardCamera }  from '../../components/camera/DashboardCamera'
import { formatMoney }     from '../../utils/formatMoney'
import { timeAgo }         from '../../utils/timeAgo'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

export function WorkerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user }   = useAuthStore()
  const qc         = useQueryClient()

  // Fetch profile for stats + isAvailable
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn:  authApi.me,
    staleTime: 30_000,
  })

  // Active tasks
  const activeQuery = useQuery({
    queryKey: ['worker-tasks-active'],
    queryFn:  () => workerTasksApi.myTasks({ status: 'IN_PROGRESS', limit: 1 }),
    staleTime: 10_000,
  })

  // Accepted (not yet started)
  const acceptedQuery = useQuery({
    queryKey: ['worker-tasks-accepted'],
    queryFn:  () => workerTasksApi.myTasks({ status: 'ACCEPTED', limit: 1 }),
    staleTime: 10_000,
  })

  // Wallet
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn:  () => apiClient.get('/worker/wallet').then(r => r.data),
    staleTime: 30_000,
  })

  // Toggle availability
  const availMutation = useMutation({
    mutationFn: (isAvailable: boolean) =>
      apiClient.patch('/worker/availability', { isAvailable }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const wp          = meQuery.data?.workerProfile
  const isAvailable = wp?.isAvailable ?? true
  const activeTask  = activeQuery.data?.tasks?.[0] ?? acceptedQuery.data?.tasks?.[0]
  const wallet      = walletQuery.data

  const isRefreshing = meQuery.isFetching || activeQuery.isFetching

  const onRefresh = () => {
    meQuery.refetch()
    activeQuery.refetch()
    acceptedQuery.refetch()
    walletQuery.refetch()
  }

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.brand.primary} />
        }
      >
        {/* ── Gradient header ── */}
        <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={s.header}>
          <View style={s.headerTop}>
            <View>
              <Text style={s.greeting}>Good morning, {user?.name?.split(' ')[0]} 👋</Text>
              <Text style={s.headerSub}>Ready to clean today?</Text>
            </View>
            {/* Online / Busy toggle */}
            <View style={s.toggleBox}>
              <Text style={s.toggleLabel}>{isAvailable ? 'Online' : 'Busy'}</Text>
              <Switch
                value={isAvailable}
                onValueChange={(val) => availMutation.mutate(val)}
                trackColor={{ false: COLORS.neutral[400], true: '#86EFAC' }}
                thumbColor={isAvailable ? '#16A34A' : '#fff'}
                disabled={availMutation.isPending}
              />
            </View>
          </View>

          {/* Earnings row */}
          <View style={s.earningsRow}>
            <View style={s.earningItem}>
              <Text style={s.earningVal}>
                {wallet ? formatMoney(wallet.availableCents) : '—'}
              </Text>
              <Text style={s.earningLbl}>Available</Text>
            </View>
            <View style={s.earningDivider} />
            <View style={s.earningItem}>
              <Text style={s.earningVal}>
                {wallet ? formatMoney(wallet.pendingCents) : '—'}
              </Text>
              <Text style={s.earningLbl}>Pending</Text>
            </View>
            <View style={s.earningDivider} />
            <View style={s.earningItem}>
              <Text style={s.earningVal}>{wp?.completedTasks ?? 0}</Text>
              <Text style={s.earningLbl}>Completed</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Active task card ── */}
        {activeTask && (
          <TouchableOpacity
            style={s.activeCard}
            onPress={() => navigation.navigate('ActiveTask', { taskId: activeTask.id })}
            activeOpacity={0.85}
          >
            <View style={s.activeCardHeader}>
              <View style={[s.activeDot, { backgroundColor: activeTask.status === 'IN_PROGRESS' ? COLORS.brand.primary : '#D97706' }]} />
              <Text style={s.activeCardLabel}>
                {activeTask.status === 'IN_PROGRESS' ? 'ACTIVE TASK' : 'ACCEPTED — Tap to start'}
              </Text>
            </View>
            <Text style={s.activeCardTitle} numberOfLines={1}>{activeTask.title}</Text>
            <View style={s.activeCardMeta}>
              <Text style={s.activeCardPrice}>{formatMoney(activeTask.rateCents)}</Text>
              <StatusBadge status={activeTask.status} small />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Quick stats ── */}
        <View style={s.statsRow}>
          <StatCard
            icon={<Star size={20} color="#F59E0B" />}
            label="Rating"
            value={wp?.rating ? wp.rating.toFixed(1) : '—'}
          />
          <StatCard
            icon={<CheckCircle size={20} color={COLORS.brand.primary} />}
            label="Done"
            value={String(wp?.completedTasks ?? 0)}
          />
          <StatCard
            icon={<Wallet size={20} color="#8B5CF6" />}
            label="Earned"
            value={wallet ? `₹${Math.floor(wallet.totalEarnedCents / 100)}` : '—'}
          />
        </View>

        {/* ── Find Work CTA ── */}
        <TouchableOpacity
          style={s.findWorkBtn}
          onPress={() => navigation.navigate('WorkerTabs' as any)}
          activeOpacity={0.85}
        >
          <MapPin size={20} color="#fff" />
          <Text style={s.findWorkText}>Find Work Near Me</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
        {/* Quick Camera & Gallery */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <DashboardCamera
            onGalleryPress={() => navigation.navigate('Gallery' as any)}
            showGalleryBtn
          />
        </View>

      </ScrollView>
    </ScreenWrapper>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={s.statCard}>
      {icon}
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  header:        { paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 },
  headerTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting:      { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerSub:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  toggleBox:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  toggleLabel:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  earningsRow:   { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 16 },
  earningItem:   { flex: 1, alignItems: 'center' },
  earningVal:    { fontSize: 17, fontWeight: '800', color: '#fff' },
  earningLbl:    { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  earningDivider:{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  activeCard:    { margin: 16, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: COLORS.brand.primary, elevation: 3, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8 },
  activeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  activeDot:     { width: 8, height: 8, borderRadius: 4 },
  activeCardLabel:{ fontSize: 11, fontWeight: '700', color: COLORS.neutral[500], letterSpacing: 0.5 },
  activeCardTitle:{ fontSize: 16, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 8 },
  activeCardMeta:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeCardPrice:{ fontSize: 18, fontWeight: '800', color: COLORS.brand.primary },
  statsRow:      { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard:      { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  statVal:       { fontSize: 17, fontWeight: '800', color: COLORS.neutral[900] },
  statLbl:       { fontSize: 11, color: COLORS.neutral[500] },
  findWorkBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.brand.primary, borderRadius: 14, paddingVertical: 16, marginHorizontal: 16 },
  findWorkText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
})
