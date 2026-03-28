import React from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Switch, Dimensions,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  MapPin, Star, CheckCircle, Wallet, ChevronRight,
  ArrowRight, Clock, Search, Camera, Zap,
  Shield, TrendingUp, MessageCircle,
} from 'lucide-react-native'
import { ScreenWrapper }   from '../../components/layout/ScreenWrapper'
import { StatusBadge }     from '../../components/ui/Badge'
import { AppHeader }       from '../../components/layout/AppHeader'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi }  from '../../api/tasks.api'
import { authApi }         from '../../api/auth.api'
import { apiClient }       from '../../api/client'
import { useAuthStore }    from '../../stores/authStore'
import { DashboardCamera }  from '../../components/camera/DashboardCamera'
import { formatMoney }     from '../../utils/formatMoney'
import { timeAgo }         from '../../utils/timeAgo'
import type { WorkerStackParamList } from '../../navigation/types'
import type { Task } from '../../types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>
const { width: SW } = Dimensions.get('window')

const DAILY_TIPS = [
  'Accept tasks close to you to save travel time',
  'Take clear BEFORE photos — they improve your AI score',
  'Complete tasks quickly for higher ratings from buyers',
  'Stay online during morning hours for more task requests',
  'CRITICAL tasks pay 3x more than LIGHT tasks',
  'GPS tracking helps buyers trust your work',
  'Upload AFTER photos from the same angle as BEFORE',
]

export function WorkerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user }   = useAuthStore()
  const qc         = useQueryClient()

  const meQuery = useQuery({ queryKey: ['me'], queryFn: authApi.me, staleTime: 30_000 })
  const activeQuery = useQuery({
    queryKey: ['worker-tasks-active'],
    queryFn: () => workerTasksApi.myTasks({ status: 'IN_PROGRESS', limit: 1 }),
    staleTime: 10_000,
  })
  const acceptedQuery = useQuery({
    queryKey: ['worker-tasks-accepted'],
    queryFn: () => workerTasksApi.myTasks({ status: 'ACCEPTED', limit: 1 }),
    staleTime: 10_000,
  })
  const recentQuery = useQuery({
    queryKey: ['worker-tasks-recent'],
    queryFn: () => workerTasksApi.myTasks({ limit: 50 }),
    staleTime: 30_000,
  })
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiClient.get('/worker/wallet').then(r => r.data),
    staleTime: 30_000,
  })

  const availMutation = useMutation({
    mutationFn: (isAvailable: boolean) =>
      apiClient.patch('/worker/availability', { isAvailable }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const wp = meQuery.data?.workerProfile
  const isAvailable = wp?.isAvailable ?? true
  const activeTask = activeQuery.data?.tasks?.[0] ?? acceptedQuery.data?.tasks?.[0]
  const wallet = walletQuery.data
  const recentTasks = (recentQuery.data?.tasks ?? []).filter(t => ['APPROVED', 'COMPLETED'].includes(t.status)).slice(0, 5)

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const onRefresh = () => {
    meQuery.refetch(); activeQuery.refetch(); acceptedQuery.refetch()
    walletQuery.refetch(); recentQuery.refetch()
  }

  return (
    <ScreenWrapper backgroundColor={W.background}>
      <AppHeader title="eClean" theme="worker" onNotificationPress={() => navigation.navigate('Notifications' as any)} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={meQuery.isFetching} onRefresh={onRefresh} tintColor={W.primary} />}
      >
        {/* ── Greeting + Status ── */}
        <View style={s.greetingBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetingText}>{greeting},</Text>
            <Text style={s.greetingName}>{firstName}</Text>
          </View>
          <View style={[s.statusPill, isAvailable ? s.statusOnline : s.statusBusy]}>
            <View style={[s.statusDot, { backgroundColor: isAvailable ? '#16A34A' : W.status.warning }]} />
            <Text style={[s.statusText, { color: isAvailable ? '#15803D' : '#92400E' }]}>
              {isAvailable ? 'Online' : 'Busy'}
            </Text>
            <Switch
              value={isAvailable}
              onValueChange={(val) => availMutation.mutate(val)}
              trackColor={{ false: '#E5E7EB', true: '#86EFAC' }}
              thumbColor={isAvailable ? '#16A34A' : '#9CA3AF'}
              disabled={availMutation.isPending}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>

        {/* ── Earnings Card ── */}
        <View style={s.earningsCard}>
          <View style={s.earningsTop}>
            <Text style={s.earningsLabel}>Today's Earnings</Text>
            <TouchableOpacity onPress={() => (navigation as any).navigate('Wallet')} style={s.earningsLink}>
              <Text style={s.earningsLinkText}>Wallet</Text>
              <ChevronRight size={14} color={W.primary} />
            </TouchableOpacity>
          </View>
          <Text style={s.earningsAmount}>
            {wallet ? formatMoney(wallet.availableCents, 'INR') : '---'}
          </Text>
          <View style={s.earningsRow}>
            <View style={s.earningsItem}>
              <View style={[s.earningsDot, { backgroundColor: W.earnings.pending }]} />
              <Text style={s.earningsItemLabel}>Pending</Text>
              <Text style={s.earningsItemVal}>{wallet ? formatMoney(wallet.pendingCents, 'INR') : '—'}</Text>
            </View>
            <View style={s.earningsItem}>
              <View style={[s.earningsDot, { backgroundColor: W.earnings.processing }]} />
              <Text style={s.earningsItemLabel}>Processing</Text>
              <Text style={s.earningsItemVal}>{wallet ? formatMoney(wallet.processingCents ?? 0, 'INR') : '—'}</Text>
            </View>
          </View>
        </View>

        {/* ── Active Task Card ── */}
        {activeTask && (
          <TouchableOpacity
            style={s.activeCard}
            onPress={() => {
              navigation.navigate('ActiveTask', { taskId: activeTask.id })
            }}
            activeOpacity={0.9}
          >
            <View style={s.activeAccent} />
            <View style={s.activeBody}>
              <View style={s.activeTop}>
                <View style={[s.activeBadge, { backgroundColor: activeTask.status === 'IN_PROGRESS' ? W.primary : W.secondary }]}>
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
              <View style={s.activeActions}>
                <View style={s.activeActionBtn}>
                  <ArrowRight size={14} color={W.primary} />
                  <Text style={s.activeActionText}>
                    {activeTask.status === 'IN_PROGRESS' ? 'Continue Work' : 'Start Task'}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Find Work CTA ── */}
        <TouchableOpacity
          style={s.findWorkCta}
          onPress={() => (navigation as any).navigate('FindWork')}
          activeOpacity={0.9}
        >
          <View style={s.findWorkLeft}>
            <Search size={22} color={W.primary} />
            <View>
              <Text style={s.findWorkTitle}>Find Work Near Me</Text>
              <Text style={s.findWorkSub}>Browse available cleaning tasks</Text>
            </View>
          </View>
          <View style={s.findWorkArrow}>
            <ArrowRight size={18} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* ── Stats Strip ── */}
        <View style={s.statsStrip}>
          <View style={s.statItem}>
            <Star size={16} color={W.secondary} />
            <Text style={s.statNum}>{wp?.rating ? wp.rating.toFixed(1) : '—'}</Text>
            <Text style={s.statLbl}>Rating</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <CheckCircle size={16} color={W.primary} />
            <Text style={s.statNum}>{wp?.completedTasks ?? 0}</Text>
            <Text style={s.statLbl}>Done</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <TrendingUp size={16} color="#8B5CF6" />
            <Text style={s.statNum}>{wallet ? formatMoney(wallet.totalEarnedCents, 'INR') : '—'}</Text>
            <Text style={s.statLbl}>Total</Text>
          </View>
        </View>

        {/* ── Daily Tip ── */}
        <View style={s.tipCard}>
          <Zap size={16} color={W.secondary} />
          <Text style={s.tipText}>{DAILY_TIPS[new Date().getDay() % DAILY_TIPS.length]}</Text>
        </View>

        {/* ── Quick Capture ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Capture</Text>
          <DashboardCamera
            onGalleryPress={() => navigation.navigate('Gallery' as any)}
            showGalleryBtn
          />
        </View>

        {/* ── Recent Completions ── */}
        {recentTasks.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Recently Completed</Text>
              <TouchableOpacity onPress={() => (navigation as any).navigate('MyTasks')}>
                <Text style={s.seeAll}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={s.recentList}>
              {recentTasks.map((task, i) => (
                <TouchableOpacity
                  key={task.id}
                  style={[s.recentItem, i < recentTasks.length - 1 && s.recentBorder]}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.recentTitle} numberOfLines={1}>{task.title}</Text>
                    <Text style={s.recentMeta}>{timeAgo(task.completedAt ?? task.updatedAt)}</Text>
                  </View>
                  <Text style={s.recentPrice}>{formatMoney(task.rateCents, 'INR')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Trust Footer ── */}
        <View style={s.trustRow}>
          <View style={s.trustItem}>
            <Shield size={18} color={W.primary} />
            <Text style={s.trustText}>Verified{'\n'}Platform</Text>
          </View>
          <View style={s.trustItem}>
            <Camera size={18} color={W.primary} />
            <Text style={s.trustText}>AI Photo{'\n'}Scoring</Text>
          </View>
          <View style={s.trustItem}>
            <Wallet size={18} color={W.primary} />
            <Text style={s.trustText}>Instant{'\n'}Payouts</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </ScreenWrapper>
  )
}

const s = StyleSheet.create({
  // Greeting
  greetingBox:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  greetingText:   { fontSize: 16, color: W.text.secondary },
  greetingName:   { fontSize: 26, fontWeight: '800', color: W.text.primary, marginTop: -2 },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: 20 },
  statusOnline:   { backgroundColor: '#DCFCE7' },
  statusBusy:     { backgroundColor: '#FEF3C7' },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusText:     { fontSize: 12, fontWeight: '700' },

  // Earnings
  earningsCard:   { marginHorizontal: 20, marginTop: 12, backgroundColor: W.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: W.border, shadowColor: W.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  earningsTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsLabel:  { fontSize: 13, color: W.text.muted },
  earningsLink:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  earningsLinkText: { fontSize: 13, fontWeight: '600', color: W.primary },
  earningsAmount: { fontSize: 32, fontWeight: '800', color: W.text.primary, marginTop: 4 },
  earningsRow:    { flexDirection: 'row', gap: 20, marginTop: 12 },
  earningsItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  earningsDot:    { width: 8, height: 8, borderRadius: 4 },
  earningsItemLabel: { fontSize: 12, color: W.text.muted },
  earningsItemVal:{ fontSize: 13, fontWeight: '700', color: W.text.secondary },

  // Active task
  activeCard:     { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, borderWidth: 1, borderColor: W.primary, overflow: 'hidden' },
  activeAccent:   { width: 4, backgroundColor: W.primary },
  activeBody:     { flex: 1, padding: 16 },
  activeTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  activeBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  activeBadgeText:{ fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  activePrice:    { fontSize: 17, fontWeight: '800', color: W.primary },
  activeTitle:    { fontSize: 15, fontWeight: '700', color: W.text.primary },
  activeLocRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  activeLoc:      { fontSize: 12, color: W.text.muted, flex: 1 },
  activeActions:  { flexDirection: 'row', marginTop: 12 },
  activeActionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: W.primaryTint, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  activeActionText: { fontSize: 13, fontWeight: '600', color: W.primary },

  // Find work
  findWorkCta:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: W.border },
  findWorkLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  findWorkTitle:  { fontSize: 15, fontWeight: '700', color: W.text.primary },
  findWorkSub:    { fontSize: 12, color: W.text.muted, marginTop: 1 },
  findWorkArrow:  { width: 40, height: 40, borderRadius: 12, backgroundColor: W.primary, alignItems: 'center', justifyContent: 'center' },

  // Stats
  statsStrip:     { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, backgroundColor: W.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: W.border },
  statItem:       { flex: 1, alignItems: 'center', gap: 4 },
  statNum:        { fontSize: 18, fontWeight: '800', color: W.text.primary },
  statLbl:        { fontSize: 10, color: W.text.muted },
  statDivider:    { width: 1, backgroundColor: W.border },

  // Tip
  tipCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 16, backgroundColor: W.secondaryLight, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A' },
  tipText:        { fontSize: 13, color: '#92400E', lineHeight: 18, flex: 1 },

  // Section
  section:        { paddingHorizontal: 20, marginTop: 20 },
  sectionHead:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:   { fontSize: 16, fontWeight: '700', color: W.text.primary, marginBottom: 10 },
  seeAll:         { fontSize: 13, fontWeight: '600', color: W.primary },

  // Recent
  recentList:     { backgroundColor: W.surface, borderRadius: 14, borderWidth: 1, borderColor: W.border, overflow: 'hidden' },
  recentItem:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  recentBorder:   { borderBottomWidth: 1, borderBottomColor: W.border },
  recentTitle:    { fontSize: 14, fontWeight: '600', color: W.text.primary },
  recentMeta:     { fontSize: 11, color: W.text.muted, marginTop: 2 },
  recentPrice:    { fontSize: 14, fontWeight: '700', color: W.primary },

  // Trust
  trustRow:       { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: W.primaryTint, borderRadius: 14, padding: 16 },
  trustItem:      { flex: 1, alignItems: 'center', gap: 6 },
  trustText:      { fontSize: 10, fontWeight: '600', color: W.primaryDark, textAlign: 'center', lineHeight: 14 },
})
