// BuyerHomeScreen — Premium consumer-app design (Zomato/Uber/Rapido inspired)
import React, { useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  Plus, ChevronRight, MapPin, Clock,
  AlertCircle, ArrowRight, MessageCircle,
  Shield, Sparkles, Eye,
  Droplets, TreePine, Trash2, Wrench, Waves,
  Navigation, Star, TrendingUp,
} from 'lucide-react-native'
import { StatusBar } from 'expo-status-bar'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { LinearGradient } from '../../components/LinearGradientShim'
import { AppHeader }      from '../../components/layout/AppHeader'
import { buyerTasksApi }  from '../../api/tasks.api'
import { authApi }         from '../../api/auth.api'
import { useAuthStore }   from '../../stores/authStore'
import { formatMoney }    from '../../utils/formatMoney'
import { timeAgo }        from '../../utils/timeAgo'
import type { BuyerStackParamList } from '../../navigation/types'
import type { Task } from '../../types'

type Nav = NativeStackNavigationProp<BuyerStackParamList>
const { width: SW } = Dimensions.get('window')

const QUICK_CATS = [
  { label: 'Street',   icon: Wrench,   color: '#6366F1', bg: '#EEF2FF' },
  { label: 'Drain',    icon: Droplets, color: '#3B82F6', bg: '#EFF6FF' },
  { label: 'Park',     icon: TreePine, color: '#10B981', bg: '#ECFDF5' },
  { label: 'Garbage',  icon: Trash2,   color: '#F59E0B', bg: '#FEF3C7' },
  { label: 'Toilet',   icon: Waves,    color: '#8B5CF6', bg: '#F5F3FF' },
  { label: 'Other',    icon: Plus,     color: '#64748B', bg: '#F1F5F9' },
]

const DAILY_TIPS = [
  'Tasks posted before 7 AM get accepted 35% faster',
  'Adding a reference photo helps workers understand the job',
  'Higher urgency tasks attract workers quicker',
  'Detailed descriptions lead to better cleaning quality',
  'Use GPS location for accurate task placement on the map',
  'Rate workers to build a trusted network',
]

export function BuyerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const { user }   = useAuthStore()

  const activeQuery = useQuery({
    queryKey: ['buyer-tasks-active'],
    queryFn:  () => buyerTasksApi.listTasks({ status: 'OPEN,ACCEPTED,IN_PROGRESS,SUBMITTED,VERIFIED', page: 1, limit: 10 }),
    staleTime: 15_000,
  })

  const allQuery = useQuery({
    queryKey: ['buyer-tasks-all-home'],
    queryFn:  () => buyerTasksApi.listTasks({ page: 1, limit: 50 }),
    staleTime: 30_000,
  })

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn:  authApi.me,
    staleTime: 60_000,
  })

  const totalSpent = meQuery.data?.buyerProfile?.totalSpentCents ?? 0
  const tasks  = activeQuery.data?.tasks ?? []
  const allTasks = allQuery.data?.tasks ?? []

  const { inProgress, needsReview, openTasks, completed, recentDone } = useMemo(() => {
    const ip = tasks.filter(t => t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS')
    const nr = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'VERIFIED')
    const op = tasks.filter(t => t.status === 'OPEN')
    const done = allTasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED')
    return { inProgress: ip, needsReview: nr, openTasks: op, completed: done, recentDone: done.slice(0, 3) }
  }, [tasks, allTasks])

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const loading = activeQuery.isLoading

  return (
    <View style={{ flex: 1, backgroundColor: B.background }}>
      <StatusBar style="dark" />
      <AppHeader onNotificationPress={() => navigation.navigate('Notifications' as any)} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isFetching}
            onRefresh={() => { activeQuery.refetch(); allQuery.refetch(); meQuery.refetch() }}
            tintColor={B.primary}
          />
        }
      >
        {/* ── Hero Section ── */}
        <LinearGradient colors={B.gradient} style={s.hero}>
          <View style={s.heroContent}>
            <Text style={s.heroGreeting}>{greeting},</Text>
            <Text style={s.heroName}>{firstName}</Text>
          </View>

          {/* Big CTA — Uber/Rapido style search bar */}
          <TouchableOpacity
            style={s.heroCta}
            onPress={() => (navigation as any).navigate('PostTask')}
            activeOpacity={0.95}
          >
            <View style={s.heroCtaIcon}>
              <Plus size={20} color="#fff" strokeWidth={3} />
            </View>
            <View style={s.heroCtaText}>
              <Text style={s.heroCtaTitle}>What needs cleaning?</Text>
              <Text style={s.heroCtaSub}>Post a task — workers respond in minutes</Text>
            </View>
            <ArrowRight size={20} color={B.primary} />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Quick Category Pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
          style={s.catScrollWrap}
        >
          {QUICK_CATS.map(cat => {
            const Icon = cat.icon
            return (
              <TouchableOpacity
                key={cat.label}
                style={s.catPill}
                onPress={() => (navigation as any).navigate('PostTask')}
                activeOpacity={0.85}
              >
                <View style={[s.catPillIcon, { backgroundColor: cat.bg }]}>
                  <Icon size={18} color={cat.color} />
                </View>
                <Text style={s.catPillLabel}>{cat.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* ── Needs Review Banner (gold/urgent) ── */}
        {needsReview.length > 0 && (
          <View style={s.pad}>
            <TouchableOpacity
              style={s.reviewBanner}
              onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: needsReview[0].id })}
              activeOpacity={0.9}
            >
              <View style={s.reviewBannerDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.reviewBannerTitle}>
                  {needsReview.length} task{needsReview.length > 1 ? 's' : ''} ready to review
                </Text>
                <Text style={s.reviewBannerSub}>
                  AI verified — approve to release payment
                </Text>
              </View>
              <View style={s.reviewBannerBtn}>
                <Eye size={16} color="#fff" />
              </View>
            </TouchableOpacity>

            {needsReview.map(task => (
              <TouchableOpacity
                key={task.id}
                style={s.reviewCard}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.reviewCardTitle} numberOfLines={1}>{task.title}</Text>
                  <View style={s.reviewCardMeta}>
                    <Text style={s.reviewCardPrice}>{formatMoney(task.rateCents, 'INR')}</Text>
                    <Text style={s.reviewCardDot}>·</Text>
                    <Text style={s.reviewCardTime}>Submitted {timeAgo(task.submittedAt ?? task.updatedAt)}</Text>
                  </View>
                </View>
                <Text style={s.reviewCta}>Review</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Live Tasks — Uber-style cards ── */}
        {inProgress.length > 0 && (
          <View style={s.pad}>
            <SectionHead title="Live Now" count={inProgress.length} />
            {inProgress.map(task => (
              <LiveCard
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                onChat={() => navigation.navigate('Chat', { taskId: task.id, title: task.title })}
                onTrack={() => navigation.navigate('LiveTrack', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Stats Row — Zomato-style compact ── */}
        <View style={s.pad}>
          <View style={s.statsRow}>
            <StatCard
              num={allTasks.length.toString()}
              label="Posted"
              tint={B.tint.blue}
              color="#3B82F6"
            />
            <StatCard
              num={completed.length.toString()}
              label="Done"
              tint={B.tint.green}
              color="#10B981"
            />
            <StatCard
              num={formatMoney(totalSpent, 'INR')}
              label="Spent"
              tint={B.tint.orange}
              color="#F59E0B"
            />
          </View>
        </View>

        {/* ── Open Tasks ── */}
        {openTasks.length > 0 && (
          <View style={s.pad}>
            <SectionHead title="Finding Workers" />
            {openTasks.map(task => (
              <OpenCard
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Recently Completed ── */}
        {recentDone.length > 0 && (
          <View style={s.pad}>
            <SectionHead
              title="Recently Completed"
              action="All Tasks"
              onAction={() => (navigation as any).navigate('BuyerTasks')}
            />
            {recentDone.map(task => (
              <DoneRow
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Daily Tip ── */}
        <View style={s.pad}>
          <View style={s.tipCard}>
            <Sparkles size={16} color="#F59E0B" />
            <Text style={s.tipText}>{DAILY_TIPS[new Date().getDay() % DAILY_TIPS.length]}</Text>
          </View>
        </View>

        {/* ── Trust Strip — Rapido style ── */}
        <View style={[s.pad, { marginBottom: 8 }]}>
          <View style={s.trustStrip}>
            <View style={s.trustItem}>
              <Shield size={16} color={B.secondary} />
              <Text style={s.trustLabel}>Verified Workers</Text>
            </View>
            <View style={s.trustDot} />
            <View style={s.trustItem}>
              <Sparkles size={16} color={B.secondary} />
              <Text style={s.trustLabel}>AI Verified</Text>
            </View>
            <View style={s.trustDot} />
            <View style={s.trustItem}>
              <Shield size={16} color={B.secondary} />
              <Text style={s.trustLabel}>Escrow Pay</Text>
            </View>
          </View>
        </View>

        {/* ── Empty state ── */}
        {!loading && allTasks.length === 0 && (
          <View style={s.emptyBox}>
            <View style={s.emptyIconWrap}>
              <MapPin size={36} color={B.primary} />
            </View>
            <Text style={s.emptyTitle}>All clean here!</Text>
            <Text style={s.emptySub}>
              Post a cleaning task — verified workers nearby will handle it with AI-verified quality.
            </Text>
            <TouchableOpacity
              style={s.emptyCta}
              onPress={() => (navigation as any).navigate('PostTask')}
              activeOpacity={0.85}
            >
              <Plus size={18} color="#fff" />
              <Text style={s.emptyCtaText}>Post Your First Task</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && <ActivityIndicator color={B.primary} style={{ marginTop: 40 }} />}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  )
}

// ── Sub-components ──────────────────────────────────────────

function SectionHead({ title, count, action, onAction }: {
  title: string; count?: number; action?: string; onAction?: () => void
}) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {count != null && count > 0 && (
        <View style={s.countBadge}><Text style={s.countText}>{count}</Text></View>
      )}
      <View style={{ flex: 1 }} />
      {action && (
        <TouchableOpacity onPress={onAction} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
          <ChevronRight size={14} color={B.primary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function StatCard({ num, label, tint, color }: {
  num: string; label: string; tint: string; color: string
}) {
  return (
    <View style={[s.statCard, { backgroundColor: tint }]}>
      <Text style={[s.statNum, { color }]}>{num}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function LiveCard({ task, onPress, onChat, onTrack }: {
  task: Task; onPress: () => void; onChat: () => void; onTrack: () => void
}) {
  const elapsed = task.startedAt
    ? Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 60000)
    : null
  const pct = task.status === 'IN_PROGRESS' ? 65 : 30

  return (
    <TouchableOpacity style={s.liveCard} onPress={onPress} activeOpacity={0.92}>
      {/* Live indicator */}
      <View style={s.liveIndicator}>
        <View style={s.liveDot} />
        <Text style={s.liveLabel}>LIVE</Text>
      </View>

      <Text style={s.liveTitle} numberOfLines={1}>{task.title}</Text>

      {task.locationAddress && (
        <View style={s.liveLocRow}>
          <MapPin size={11} color={B.text.muted} />
          <Text style={s.liveLoc} numberOfLines={1}>{task.locationAddress}</Text>
        </View>
      )}

      {/* Progress bar */}
      <View style={s.liveProgressRow}>
        <View style={s.liveProgressBg}>
          <View style={[s.liveProgressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.liveProgressText}>{pct}%</Text>
      </View>

      {/* Bottom row — price + actions */}
      <View style={s.liveBottom}>
        <Text style={s.livePrice}>{formatMoney(task.rateCents, 'INR')}</Text>
        {elapsed != null && (
          <View style={s.liveTimeChip}>
            <Clock size={11} color={B.text.secondary} />
            <Text style={s.liveTimeText}>{elapsed}m</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.liveActionBtn} onPress={onTrack}>
          <Navigation size={14} color={B.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.liveActionBtn} onPress={onChat}>
          <MessageCircle size={14} color={B.secondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

function OpenCard({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.openCard} onPress={onPress} activeOpacity={0.85}>
      <View style={s.openPulse} />
      <View style={{ flex: 1 }}>
        <Text style={s.openTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={s.openMeta}>{formatMoney(task.rateCents, 'INR')} · {timeAgo(task.createdAt)}</Text>
      </View>
      <ChevronRight size={16} color={B.text.muted} />
    </TouchableOpacity>
  )
}

function DoneRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.doneRow} onPress={onPress} activeOpacity={0.85}>
      <View style={s.doneCheck}>
        <Text style={s.doneCheckText}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.doneTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={s.doneMeta}>
          {formatMoney(task.rateCents, 'INR')} · {timeAgo(task.completedAt ?? task.updatedAt)}
        </Text>
      </View>
      {task.aiScore != null && (
        <View style={s.doneScore}>
          <Star size={10} color="#F59E0B" />
          <Text style={s.doneScoreText}>{task.aiScore}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // Hero
  hero:           { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  heroContent:    { marginBottom: 18 },
  heroGreeting:   { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  heroName:       { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 2 },
  heroCta:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  heroCtaIcon:    { width: 44, height: 44, borderRadius: 14, backgroundColor: B.primary, alignItems: 'center', justifyContent: 'center' },
  heroCtaText:    { flex: 1 },
  heroCtaTitle:   { fontSize: 16, fontWeight: '700', color: B.text.primary },
  heroCtaSub:     { fontSize: 12, color: B.text.muted, marginTop: 2 },

  // Category pills
  catScrollWrap:  { marginTop: 16 },
  catRow:         { paddingHorizontal: 16, gap: 10 },
  catPill:        { alignItems: 'center', width: 64 },
  catPillIcon:    { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  catPillLabel:   { fontSize: 11, fontWeight: '600', color: B.text.secondary },

  // Sections
  sectionHead:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  sectionTitle:   { fontSize: 18, fontWeight: '800', color: B.text.primary },
  countBadge:     { backgroundColor: B.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText:      { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionAction:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontSize: 13, fontWeight: '600', color: B.primary },

  // Review banner
  reviewBanner:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 14, padding: 16, gap: 12, marginBottom: 10 },
  reviewBannerDot:{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  reviewBannerTitle: { fontSize: 15, fontWeight: '700', color: '#92400E' },
  reviewBannerSub: { fontSize: 12, color: '#B45309', marginTop: 2 },
  reviewBannerBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },

  // Review card
  reviewCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: B.surface, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: B.border },
  reviewCardTitle:{ fontSize: 15, fontWeight: '700', color: B.text.primary },
  reviewCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  reviewCardPrice:{ fontSize: 13, fontWeight: '700', color: B.primary },
  reviewCardDot:  { fontSize: 13, color: B.text.muted },
  reviewCardTime: { fontSize: 12, color: B.text.muted },
  reviewCta:      { fontSize: 13, fontWeight: '700', color: B.primary, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: B.primaryTint, borderRadius: 10, overflow: 'hidden' },

  // Stats row
  statsRow:       { flexDirection: 'row', gap: 10 },
  statCard:       { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  statNum:        { fontSize: 20, fontWeight: '800' },
  statLabel:      { fontSize: 11, fontWeight: '600', color: B.text.secondary, marginTop: 3 },

  // Live card
  liveCard:       { backgroundColor: B.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: B.border, shadowColor: B.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  liveIndicator:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  liveDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  liveLabel:      { fontSize: 10, fontWeight: '800', color: '#10B981', letterSpacing: 1 },
  liveTitle:      { fontSize: 16, fontWeight: '700', color: B.text.primary },
  liveLocRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  liveLoc:        { fontSize: 12, color: B.text.muted, flex: 1 },
  liveProgressRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  liveProgressBg: { flex: 1, height: 6, backgroundColor: B.border, borderRadius: 3, overflow: 'hidden' },
  liveProgressFill:{ height: 6, backgroundColor: B.primary, borderRadius: 3 },
  liveProgressText:{ fontSize: 12, fontWeight: '700', color: B.text.secondary, minWidth: 30 },
  liveBottom:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  livePrice:      { fontSize: 18, fontWeight: '800', color: B.text.primary },
  liveTimeChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: B.tint.blue, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  liveTimeText:   { fontSize: 11, fontWeight: '600', color: B.text.secondary },
  liveActionBtn:  { width: 36, height: 36, borderRadius: 12, backgroundColor: B.background, alignItems: 'center', justifyContent: 'center' },

  // Open card
  openCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: B.surface, borderRadius: 14, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: B.border },
  openPulse:      { width: 10, height: 10, borderRadius: 5, backgroundColor: B.text.muted },
  openTitle:      { fontSize: 14, fontWeight: '600', color: B.text.primary },
  openMeta:       { fontSize: 12, color: B.text.muted, marginTop: 2 },

  // Done row
  doneRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: B.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: B.border },
  doneCheck:      { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  doneCheckText:  { fontSize: 14, fontWeight: '700', color: '#10B981' },
  doneTitle:      { fontSize: 14, fontWeight: '600', color: B.text.primary },
  doneMeta:       { fontSize: 12, color: B.text.muted, marginTop: 2 },
  doneScore:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  doneScoreText:  { fontSize: 12, fontWeight: '800', color: '#92400E' },

  // Tip card
  tipCard:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A' },
  tipText:        { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

  // Trust strip
  trustStrip:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: B.secondaryLight, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16 },
  trustItem:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustLabel:     { fontSize: 11, fontWeight: '600', color: B.secondary },
  trustDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: B.secondary, marginHorizontal: 10, opacity: 0.4 },

  // Empty
  emptyBox:       { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIconWrap:  { width: 80, height: 80, borderRadius: 40, backgroundColor: B.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle:     { fontSize: 22, fontWeight: '800', color: B.text.primary },
  emptySub:       { fontSize: 14, color: B.text.secondary, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  emptyCta:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: B.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 16, marginTop: 24 },
  emptyCtaText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
})
