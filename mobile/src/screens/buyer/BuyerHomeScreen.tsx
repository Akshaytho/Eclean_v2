import React from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  Plus, ChevronRight, MapPin, Clock, Star,
  AlertCircle, ArrowRight, MessageCircle,
  Shield, Camera, Zap, Award, Sparkles,
  Droplets, TreePine, Trash2, Wrench,
} from 'lucide-react-native'
import { ScreenWrapper }  from '../../components/layout/ScreenWrapper'
import { StatusBadge }    from '../../components/ui/Badge'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
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
  { label: 'Street', icon: <Wrench size={20} color="#0A2463" />, bg: '#E8EDF7' },
  { label: 'Drain', icon: <Droplets size={20} color="#3B82F6" />, bg: '#DBEAFE' },
  { label: 'Park', icon: <TreePine size={20} color="#16A34A" />, bg: '#DCFCE7' },
  { label: 'Garbage', icon: <Trash2 size={20} color="#D97706" />, bg: '#FEF3C7' },
  { label: 'Toilet', icon: <Wrench size={20} color="#8B5CF6" />, bg: '#F3E8FF' },
]

const DAILY_TIPS = [
  'Tasks posted before 7 AM get accepted 35% faster',
  'Adding a reference photo helps workers understand the job better',
  'Higher urgency tasks attract workers quicker',
  'Detailed descriptions lead to better cleaning quality',
  'Use GPS location for accurate task placement on the map',
  'Rate workers after task completion to build a trusted network',
  'CRITICAL dirty level tasks have the highest completion rate',
]

const HOW_STEPS = [
  { title: 'Post a Task', sub: 'Describe what needs cleaning, add location & photo' },
  { title: 'Worker Accepts', sub: 'Verified workers nearby see your task and accept it' },
  { title: 'Track Live', sub: 'Watch real-time GPS tracking and chat with the worker' },
  { title: 'AI Verifies', sub: 'Before & after photos verified by AI — payment auto-releases' },
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

  const inProgress = tasks.filter(t => ['ACCEPTED', 'IN_PROGRESS'].includes(t.status))
  const needsReview = tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'VERIFIED')
  const openTasks = tasks.filter(t => t.status === 'OPEN')
  const completed = allTasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED')
  const recentDone = completed.slice(0, 3)

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const loading = activeQuery.isLoading

  return (
    <ScreenWrapper backgroundColor={B.background}>
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
        {/* ── Greeting ── */}
        <View style={s.greetingBox}>
          <Text style={s.greetingText}>{greeting},</Text>
          <Text style={s.greetingName}>{firstName}</Text>
        </View>

        {/* ── Post Task CTA ── */}
        <TouchableOpacity
          style={s.postCta}
          onPress={() => (navigation as any).navigate('PostTask')}
          activeOpacity={0.9}
        >
          <View style={s.postCtaLeft}>
            <Text style={s.postCtaTitle}>What needs cleaning?</Text>
            <Text style={s.postCtaSub}>Post a task in 60 seconds</Text>
          </View>
          <View style={s.postCtaBtn}>
            <Plus size={22} color="#fff" strokeWidth={3} />
          </View>
        </TouchableOpacity>

        {/* ── Needs Review (highest priority) ── */}
        {needsReview.length > 0 && (
          <View style={s.section}>
            <View style={s.reviewHeader}>
              <AlertCircle size={18} color={B.secondary} />
              <Text style={s.reviewHeaderText}>
                {needsReview.length} task{needsReview.length > 1 ? 's' : ''} awaiting your review
              </Text>
            </View>
            {needsReview.map(task => (
              <TouchableOpacity
                key={task.id}
                style={s.reviewCard}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                activeOpacity={0.85}
              >
                <View style={s.reviewCardLeft}>
                  <Text style={s.reviewCardTitle} numberOfLines={1}>{task.title}</Text>
                  <Text style={s.reviewCardMeta}>
                    {formatMoney(task.rateCents, 'INR')} · Submitted {timeAgo(task.submittedAt ?? task.updatedAt)}
                  </Text>
                </View>
                <View style={s.reviewBtn}>
                  <Text style={s.reviewBtnText}>Review</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Active Tasks ── */}
        {inProgress.length > 0 && (
          <View style={s.section}>
            <SectionHead title="In Progress" count={inProgress.length} />
            {inProgress.map(task => (
              <ActiveCard
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                onChat={() => navigation.navigate('Chat', { taskId: task.id, title: task.title })}
                onTrack={() => navigation.navigate('LiveTrack', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Stats Strip ── */}
        <View style={s.statsStrip}>
          <View style={s.statItem}>
            <Text style={s.statNum}>{allTasks.length}</Text>
            <Text style={s.statLbl}>Total</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statNum}>{completed.length}</Text>
            <Text style={s.statLbl}>Completed</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: B.secondary }]}>{formatMoney(totalSpent, 'INR')}</Text>
            <Text style={s.statLbl}>Spent</Text>
          </View>
        </View>

        {/* ── Quick Categories ── */}
        <View style={s.section}>
          <SectionHead title="Quick Post" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
            {QUICK_CATS.map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={s.catCard}
                onPress={() => (navigation as any).navigate('PostTask')}
                activeOpacity={0.85}
              >
                <View style={[s.catIcon, { backgroundColor: cat.bg }]}>
                  {cat.icon}
                </View>
                <Text style={s.catLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Daily Tip ── */}
        <View style={s.tipCard}>
          <Sparkles size={18} color={B.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={s.tipText}>{DAILY_TIPS[new Date().getDay() % DAILY_TIPS.length]}</Text>
          </View>
        </View>

        {/* ── How It Works ── */}
        <View style={s.section}>
          <SectionHead title="How eClean Works" />
          <View style={s.howCard}>
            {HOW_STEPS.map((step, i) => (
              <View key={i} style={s.howStep}>
                <View style={s.howNumWrap}>
                  <Text style={s.howNum}>{i + 1}</Text>
                  {i < HOW_STEPS.length - 1 && <View style={s.howLine} />}
                </View>
                <View style={s.howContent}>
                  <Text style={s.howTitle}>{step.title}</Text>
                  <Text style={s.howSub}>{step.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Trust Badges ── */}
        <View style={s.trustRow}>
          <View style={s.trustItem}>
            <Shield size={20} color={B.primary} />
            <Text style={s.trustText}>Verified{'\n'}Workers</Text>
          </View>
          <View style={s.trustItem}>
            <Camera size={20} color={B.primary} />
            <Text style={s.trustText}>AI Photo{'\n'}Verification</Text>
          </View>
          <View style={s.trustItem}>
            <Award size={20} color={B.primary} />
            <Text style={s.trustText}>Escrow{'\n'}Payment</Text>
          </View>
          <View style={s.trustItem}>
            <Zap size={20} color={B.primary} />
            <Text style={s.trustText}>Real-time{'\n'}Tracking</Text>
          </View>
        </View>

        {/* ── Open Tasks (waiting for workers) ── */}
        {openTasks.length > 0 && (
          <View style={s.section}>
            <SectionHead title="Waiting for Workers" />
            {openTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Recently Completed ── */}
        {recentDone.length > 0 && (
          <View style={s.section}>
            <SectionHead
              title="Recently Completed"
              action="View All"
              onAction={() => (navigation as any).navigate('BuyerTasks')}
            />
            {recentDone.map(task => (
              <DoneCard
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
              />
            ))}
          </View>
        )}

        {/* ── Empty state ── */}
        {!loading && allTasks.length === 0 && (
          <View style={s.emptyBox}>
            <View style={s.emptyIcon}>
              <MapPin size={32} color={B.primary} />
            </View>
            <Text style={s.emptyTitle}>Your areas are clean</Text>
            <Text style={s.emptySub}>
              Post a cleaning task and verified workers will handle it. Track progress in real-time.
            </Text>
            <TouchableOpacity
              style={s.emptyCta}
              onPress={() => (navigation as any).navigate('PostTask')}
            >
              <Plus size={18} color="#fff" />
              <Text style={s.emptyCtaText}>Post Your First Task</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && <ActivityIndicator color={B.primary} style={{ marginTop: 40 }} />}

        <View style={{ height: 30 }} />
      </ScrollView>
    </ScreenWrapper>
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
      {action && (
        <TouchableOpacity onPress={onAction} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
          <ChevronRight size={14} color={B.primary} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function ActiveCard({ task, onPress, onChat, onTrack }: {
  task: Task; onPress: () => void; onChat: () => void; onTrack: () => void
}) {
  const elapsed = task.startedAt
    ? Math.floor((Date.now() - new Date(task.startedAt).getTime()) / 60000)
    : null

  return (
    <TouchableOpacity style={s.activeCard} onPress={onPress} activeOpacity={0.9}>
      <View style={s.activeCardAccent} />
      <View style={s.activeCardBody}>
        <View style={s.activeTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.activeTitle} numberOfLines={1}>{task.title}</Text>
            {task.locationAddress && (
              <View style={s.activeLocRow}>
                <MapPin size={12} color={B.text.muted} />
                <Text style={s.activeLoc} numberOfLines={1}>{task.locationAddress}</Text>
              </View>
            )}
          </View>
          <Text style={s.activePrice}>{formatMoney(task.rateCents, 'INR')}</Text>
        </View>

        {/* Progress */}
        <View style={s.progressRow}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: task.status === 'IN_PROGRESS' ? '60%' : '30%' }]} />
          </View>
          {elapsed != null && (
            <Text style={s.progressTime}>{elapsed}m</Text>
          )}
        </View>

        {/* Actions */}
        <View style={s.activeActions}>
          <TouchableOpacity style={s.activeActionBtn} onPress={onTrack}>
            <MapPin size={14} color={B.primary} />
            <Text style={s.activeActionText}>Track</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.activeActionBtn} onPress={onChat}>
            <MessageCircle size={14} color={B.primary} />
            <Text style={s.activeActionText}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.activeActionBtn, s.activeDetailBtn]} onPress={onPress}>
            <Text style={s.activeDetailText}>Details</Text>
            <ArrowRight size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.taskRow} onPress={onPress} activeOpacity={0.85}>
      <View style={s.taskRowDot} />
      <View style={{ flex: 1 }}>
        <Text style={s.taskRowTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={s.taskRowMeta}>{formatMoney(task.rateCents, 'INR')} · Posted {timeAgo(task.createdAt)}</Text>
      </View>
      <ChevronRight size={16} color={B.text.muted} />
    </TouchableOpacity>
  )
}

function DoneCard({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.doneCard} onPress={onPress} activeOpacity={0.85}>
      <View style={s.doneTop}>
        <Text style={s.doneTitle} numberOfLines={1}>{task.title}</Text>
        {task.aiScore != null && (
          <View style={s.scoreBadge}>
            <Star size={10} color={B.secondary} />
            <Text style={s.scoreText}>{task.aiScore}</Text>
          </View>
        )}
      </View>
      <View style={s.doneMeta}>
        <Text style={s.doneMetaText}>{formatMoney(task.rateCents, 'INR')}</Text>
        <Text style={s.doneMetaText}>·</Text>
        <Text style={s.doneMetaText}>{timeAgo(task.completedAt ?? task.updatedAt)}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  // Greeting
  greetingBox:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  greetingText:   { fontSize: 16, color: B.text.secondary },
  greetingName:   { fontSize: 28, fontWeight: '800', color: B.text.primary, marginTop: -2 },

  // Post CTA
  postCta:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 16, backgroundColor: B.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: B.border, shadowColor: B.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  postCtaLeft:    { flex: 1 },
  postCtaTitle:   { fontSize: 17, fontWeight: '700', color: B.text.primary },
  postCtaSub:     { fontSize: 13, color: B.text.muted, marginTop: 3 },
  postCtaBtn:     { width: 48, height: 48, borderRadius: 14, backgroundColor: B.primary, alignItems: 'center', justifyContent: 'center' },

  // Sections
  section:        { marginTop: 24, paddingHorizontal: 20 },
  sectionHead:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle:   { fontSize: 17, fontWeight: '700', color: B.text.primary, flex: 1 },
  countBadge:     { backgroundColor: B.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  countText:      { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionAction:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontSize: 13, fontWeight: '600', color: B.primary },

  // Review header
  reviewHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 12 },
  reviewHeaderText: { fontSize: 14, fontWeight: '700', color: '#92400E', flex: 1 },

  // Review card
  reviewCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: B.surface, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: B.border },
  reviewCardLeft: { flex: 1, marginRight: 12 },
  reviewCardTitle:{ fontSize: 15, fontWeight: '700', color: B.text.primary },
  reviewCardMeta: { fontSize: 12, color: B.text.muted, marginTop: 3 },
  reviewBtn:      { backgroundColor: B.secondary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  reviewBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Active card
  activeCard:     { flexDirection: 'row', backgroundColor: B.surface, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: B.border, overflow: 'hidden' },
  activeCardAccent: { width: 4, backgroundColor: B.primary },
  activeCardBody: { flex: 1, padding: 16 },
  activeTop:      { flexDirection: 'row', alignItems: 'flex-start' },
  activeTitle:    { fontSize: 15, fontWeight: '700', color: B.text.primary },
  activeLocRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  activeLoc:      { fontSize: 12, color: B.text.muted, flex: 1 },
  activePrice:    { fontSize: 16, fontWeight: '800', color: B.primary, marginLeft: 8 },
  progressRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressBar:    { flex: 1, height: 4, backgroundColor: B.border, borderRadius: 2 },
  progressFill:   { height: 4, backgroundColor: B.primary, borderRadius: 2 },
  progressTime:   { fontSize: 11, fontWeight: '700', color: B.text.secondary },
  activeActions:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  activeActionBtn:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: B.primaryTint },
  activeActionText: { fontSize: 12, fontWeight: '600', color: B.primary },
  activeDetailBtn:{ backgroundColor: B.primary, marginLeft: 'auto' },
  activeDetailText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Stats strip
  statsStrip:     { flexDirection: 'row', marginHorizontal: 20, marginTop: 24, backgroundColor: B.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: B.border },
  statItem:       { flex: 1, alignItems: 'center' },
  statNum:        { fontSize: 20, fontWeight: '800', color: B.text.primary },
  statLbl:        { fontSize: 11, color: B.text.muted, marginTop: 2 },
  statDivider:    { width: 1, backgroundColor: B.border, marginHorizontal: 4 },

  // Task row (open tasks)
  taskRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: B.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: B.border },
  taskRowDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: B.text.muted },
  taskRowTitle:   { fontSize: 14, fontWeight: '600', color: B.text.primary },
  taskRowMeta:    { fontSize: 12, color: B.text.muted, marginTop: 2 },

  // Done card
  doneCard:       { backgroundColor: B.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: B.border },
  doneTop:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  doneTitle:      { fontSize: 14, fontWeight: '600', color: B.text.primary, flex: 1, marginRight: 8 },
  scoreBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF9C3', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  scoreText:      { fontSize: 12, fontWeight: '800', color: '#92400E' },
  doneMeta:       { flexDirection: 'row', gap: 6, marginTop: 6 },
  doneMetaText:   { fontSize: 12, color: B.text.muted },

  // Quick categories
  catScroll:      { gap: 12, paddingRight: 20 },
  catCard:        { alignItems: 'center', width: 72 },
  catIcon:        { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  catLabel:       { fontSize: 11, fontWeight: '600', color: B.text.secondary },

  // Daily tip
  tipCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 20, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A' },
  tipText:        { fontSize: 13, color: '#92400E', lineHeight: 18 },

  // How it works
  howCard:        { backgroundColor: B.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: B.border },
  howStep:        { flexDirection: 'row', gap: 14 },
  howNumWrap:     { alignItems: 'center', width: 24 },
  howNum:         { width: 24, height: 24, borderRadius: 12, backgroundColor: B.primary, color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 24, overflow: 'hidden' },
  howLine:        { width: 2, flex: 1, backgroundColor: B.border, marginVertical: 4 },
  howContent:     { flex: 1, paddingBottom: 16 },
  howTitle:       { fontSize: 14, fontWeight: '700', color: B.text.primary },
  howSub:         { fontSize: 12, color: B.text.muted, marginTop: 2, lineHeight: 17 },

  // Trust badges
  trustRow:       { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: B.primaryTint, borderRadius: 14, padding: 16 },
  trustItem:      { flex: 1, alignItems: 'center', gap: 6 },
  trustText:      { fontSize: 10, fontWeight: '600', color: B.primary, textAlign: 'center', lineHeight: 14 },

  // Empty
  emptyBox:       { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon:      { width: 72, height: 72, borderRadius: 36, backgroundColor: B.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:     { fontSize: 20, fontWeight: '700', color: B.text.primary },
  emptySub:       { fontSize: 14, color: B.text.secondary, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  emptyCta:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: B.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 20 },
  emptyCtaText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
})
