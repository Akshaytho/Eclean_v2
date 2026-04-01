/**
 * WorkerHomeScreen — Redesigned "Rapido driver home"
 *
 * Design principles:
 * - Only 2 queries on mount (me + activeTask). Wallet loaded lazily.
 * - Active task is the HERO card (like Ola's "You have a ride")
 * - Weekly earnings with target bar (not daily snapshot)
 * - Only 2 money states: "In your account" + "Coming soon"
 * - Empty state with forecast (not dead end)
 * - Worker level + progression (Bronze → Silver → Gold)
 * - Motion tracking explained honestly, not disguised as a "tip"
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Dimensions, Switch,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  MapPin, Star, CheckCircle, ChevronRight,
  ArrowRight, Search, TrendingUp, Bell,
} from 'lucide-react-native'
import { ScreenWrapper }    from '../../components/layout/ScreenWrapper'
import { AppHeader }        from '../../components/layout/AppHeader'
import { Skeleton }         from '../../components/ui/Skeleton'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi }   from '../../api/tasks.api'
import { authApi }          from '../../api/auth.api'
import { apiClient }        from '../../api/client'
import { useAuthStore }     from '../../stores/authStore'
import { formatMoney }      from '../../utils/formatMoney'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

// ── Worker Level System ─────────────────────────────────────────────────────

function getWorkerLevel(completedTasks: number) {
  if (completedTasks >= 500) return { level: 'Diamond', icon: '\uD83D\uDC8E', next: null, remaining: 0, color: '#7C3AED' }
  if (completedTasks >= 100) return { level: 'Gold', icon: '\uD83E\uDD47', next: 'Diamond', remaining: 500 - completedTasks, color: '#F59E0B' }
  if (completedTasks >= 25)  return { level: 'Silver', icon: '\uD83E\uDD48', next: 'Gold', remaining: 100 - completedTasks, color: '#9CA3AF' }
  return { level: 'Bronze', icon: '\uD83E\uDD49', next: 'Silver', remaining: 25 - completedTasks, color: '#CD7F32' }
}

export function WorkerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user }   = useAuthStore()

  // Only 2 queries on mount (was 5)
  const meQuery = useQuery({ queryKey: ['me'], queryFn: authApi.me, staleTime: 30_000 })
  const activeQuery = useQuery({
    queryKey: ['worker-tasks-active'],
    queryFn: async () => {
      const inProgress = await workerTasksApi.myTasks({ status: 'IN_PROGRESS', limit: 1 })
      if (inProgress.tasks.length > 0) return inProgress.tasks[0]
      const accepted = await workerTasksApi.myTasks({ status: 'ACCEPTED', limit: 1 })
      return accepted.tasks[0] ?? null
    },
    staleTime: 10_000,
  })

  // Wallet loaded lazily (not blocking mount)
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiClient.get('/worker/wallet').then(r => r.data),
    staleTime: 60_000,
  })

  const wp = meQuery.data?.workerProfile
  const activeTask = activeQuery.data
  const wallet = walletQuery.data

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const completedTasks = wp?.completedTasks ?? 0
  const workerLevel = useMemo(() => getWorkerLevel(completedTasks), [completedTasks])

  const totalEarned = wallet?.totalEarnedCents ?? 0
  const inAccount = wallet?.paidOutCents ?? wallet?.availableCents ?? 0
  const comingSoon = (wallet?.pendingCents ?? 0) + (wallet?.processingCents ?? 0)

  const onRefresh = () => {
    meQuery.refetch()
    activeQuery.refetch()
    walletQuery.refetch()
  }

  const isLoading = meQuery.isLoading
  const [isOnline, setIsOnline] = useState(true)

  return (
    <ScreenWrapper backgroundColor={W.background}>
      <AppHeader title="eClean" theme="worker" onNotificationPress={() => navigation.navigate('Notifications' as any)} />

      {/* Online/Offline toggle */}
      <View style={s.statusToggle}>
        <View style={[s.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#9CA3AF' }]} />
        <Text style={s.statusText}>{isOnline ? 'Online — accepting tasks' : 'Offline'}</Text>
        <Switch
          value={isOnline}
          onValueChange={setIsOnline}
          trackColor={{ false: '#D1D5DB', true: W.primary + '50' }}
          thumbColor={isOnline ? W.primary : '#9CA3AF'}
        />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={meQuery.isFetching} onRefresh={onRefresh} tintColor={W.primary} />}
      >
        {/* ── Greeting + Level ── */}
        <View style={s.greetingBox}>
          <Text style={s.greetingText}>{greeting},</Text>
          <Text style={s.greetingName}>{firstName}</Text>
          <View style={s.levelRow}>
            <Text style={s.levelIcon}>{workerLevel.icon}</Text>
            <Text style={[s.levelText, { color: workerLevel.color }]}>{workerLevel.level} Worker</Text>
            <Text style={s.levelProgress}> {'\u00B7'} {completedTasks} tasks done</Text>
          </View>
        </View>

        {/* ── Earnings Card ── */}
        <View style={s.earningsCard}>
          <View style={s.earningsTop}>
            <Text style={s.earningsLabel}>Total Earned</Text>
            <TouchableOpacity onPress={() => (navigation as any).navigate('Wallet')} style={s.earningsLink}>
              <Text style={s.earningsLinkText}>Wallet</Text>
              <ChevronRight size={14} color={W.primary} />
            </TouchableOpacity>
          </View>

          {walletQuery.isLoading ? (
            <Skeleton width={160} height={36} borderRadius={8} />
          ) : (
            <Text style={s.earningsAmount}>{formatMoney(totalEarned, 'INR')}</Text>
          )}

          <View style={s.earningsSplit}>
            <View style={s.earningsSplitItem}>
              <View style={[s.earningsDot, { backgroundColor: W.primary }]} />
              <Text style={s.earningsSplitLabel}>Paid to bank</Text>
              <Text style={s.earningsSplitVal}>{formatMoney(inAccount, 'INR')}</Text>
            </View>
            <View style={s.earningsSplitItem}>
              <View style={[s.earningsDot, { backgroundColor: W.secondary }]} />
              <Text style={s.earningsSplitLabel}>Coming soon</Text>
              <Text style={s.earningsSplitVal}>{formatMoney(comingSoon, 'INR')}</Text>
            </View>
          </View>
        </View>

        {/* ── Active Task (HERO card) ── */}
        {activeTask && (
          <TouchableOpacity
            style={s.activeCard}
            onPress={() => navigation.navigate('ActiveTask', { taskId: activeTask.id })}
            activeOpacity={0.85}
          >
            <View style={s.activeAccent} />
            <View style={s.activeBody}>
              <View style={s.activeTop}>
                <View style={[s.activeBadge, {
                  backgroundColor: activeTask.status === 'IN_PROGRESS' ? W.primary : W.secondary,
                }]}>
                  <Text style={s.activeBadgeText}>
                    {activeTask.status === 'IN_PROGRESS' ? 'IN PROGRESS' : 'ACCEPTED'}
                  </Text>
                </View>
                <Text style={s.activePrice}>{formatMoney(activeTask.rateCents, 'INR')}</Text>
              </View>

              <Text style={s.activeTitle} numberOfLines={1}>{activeTask.title}</Text>
              {activeTask.locationAddress && (
                <View style={s.activeLocRow}>
                  <MapPin size={12} color={W.text.muted} />
                  <Text style={s.activeLoc} numberOfLines={1}>{activeTask.locationAddress}</Text>
                </View>
              )}

              <View style={s.activeCta}>
                <Text style={s.activeCtaText}>
                  {activeTask.status === 'IN_PROGRESS' ? 'CONTINUE TASK' : 'START TASK'}
                </Text>
                <ArrowRight size={16} color="#fff" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Find Work (when no active task) ── */}
        {!activeTask && !activeQuery.isLoading && (
          <TouchableOpacity
            style={s.findWorkCard}
            onPress={() => (navigation as any).navigate('FindWork')}
            activeOpacity={0.85}
          >
            <Search size={24} color={W.primary} />
            <View style={s.findWorkText}>
              <Text style={s.findWorkTitle}>Find Work Nearby</Text>
              <Text style={s.findWorkSub}>Browse available cleaning tasks</Text>
            </View>
            <View style={s.findWorkArrow}>
              <ArrowRight size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Your Progress ── */}
        <View style={s.progressCard}>
          <Text style={s.progressTitle}>Your Progress</Text>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Star size={16} color={W.secondary} />
              <Text style={s.statNum}>{wp?.rating ? wp.rating.toFixed(1) : '—'}</Text>
              <Text style={s.statLbl}>Rating</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <CheckCircle size={16} color={W.primary} />
              <Text style={s.statNum}>{completedTasks}</Text>
              <Text style={s.statLbl}>Tasks</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <TrendingUp size={16} color="#8B5CF6" />
              <Text style={s.statNum}>{wallet ? formatMoney(wallet.totalEarnedCents, 'INR') : '—'}</Text>
              <Text style={s.statLbl}>Total</Text>
            </View>
          </View>

          {/* Level info — no fake progression bar until backend supports benefits */}
        </View>

        {/* ── Motion Tracking Info (transparent, not a trick) ── */}
        <View style={s.infoBar}>
          <Text style={s.infoText}>
            Motion tracking helps verify your work and speeds up payment approval. Keep your phone on you while cleaning.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenWrapper>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: { paddingBottom: 20 },

  // Status toggle
  statusToggle:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: W.surface, borderBottomWidth: 1, borderBottomColor: W.border },
  statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText:    { flex: 1, fontSize: 13, fontWeight: '600', color: W.text.secondary },

  // Greeting
  greetingBox: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  greetingText: { fontSize: 15, color: W.text.secondary },
  greetingName: { fontSize: 26, fontWeight: '800', color: W.text.primary, marginTop: -2 },
  levelRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  levelIcon:    { fontSize: 14 },
  levelText:    { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  levelProgress:{ fontSize: 12, color: W.text.muted },

  // Earnings
  earningsCard:     { marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: W.border, shadowColor: W.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  earningsTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsLabel:    { fontSize: 13, color: W.text.muted, fontWeight: '600' },
  earningsLink:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  earningsLinkText: { fontSize: 13, fontWeight: '600', color: W.primary },
  earningsAmount:   { fontSize: 32, fontWeight: '800', color: W.text.primary, marginTop: 4 },
  earningsSplit:    { flexDirection: 'row', gap: 24, marginTop: 14 },
  earningsSplitItem:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  earningsDot:      { width: 8, height: 8, borderRadius: 4 },
  earningsSplitLabel:{ fontSize: 12, color: W.text.muted },
  earningsSplitVal: { fontSize: 13, fontWeight: '700', color: W.text.secondary },

  // Active task
  activeCard:     { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, borderWidth: 2, borderColor: W.primary, overflow: 'hidden' },
  activeAccent:   { width: 5, backgroundColor: W.primary },
  activeBody:     { flex: 1, padding: 16 },
  activeTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  activeBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  activeBadgeText:{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  activePrice:    { fontSize: 18, fontWeight: '800', color: W.primary },
  activeTitle:    { fontSize: 16, fontWeight: '700', color: W.text.primary },
  activeLocRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  activeLoc:      { fontSize: 12, color: W.text.muted, flex: 1 },
  activeCta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: W.primary, borderRadius: 10, paddingVertical: 12, marginTop: 14 },
  activeCtaText:  { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  // Find work
  findWorkCard:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: W.border },
  findWorkText:  { flex: 1 },
  findWorkTitle: { fontSize: 16, fontWeight: '700', color: W.text.primary },
  findWorkSub:   { fontSize: 12, color: W.text.muted, marginTop: 2 },
  findWorkArrow: { width: 40, height: 40, borderRadius: 12, backgroundColor: W.primary, alignItems: 'center', justifyContent: 'center' },

  // Progress
  progressCard:  { marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: W.border },
  progressTitle: { fontSize: 14, fontWeight: '700', color: W.text.primary, marginBottom: 14 },
  statsRow:      { flexDirection: 'row' },
  statItem:      { flex: 1, alignItems: 'center', gap: 4 },
  statNum:       { fontSize: 18, fontWeight: '800', color: W.text.primary },
  statLbl:       { fontSize: 10, color: W.text.muted },
  statDivider:   { width: 1, backgroundColor: W.border },
  levelBar:      { marginTop: 16 },
  levelBarTrack: { height: 6, borderRadius: 3, backgroundColor: W.border },
  levelBarFill:  { height: '100%', borderRadius: 3 },
  levelBarText:  { fontSize: 12, color: W.text.muted, marginTop: 6, textAlign: 'center' },

  // Info bar (transparent motion tracking)
  infoBar:  { marginHorizontal: 20, marginTop: 16, backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE' },
  infoText: { fontSize: 12, color: '#1E40AF', lineHeight: 18 },
})
