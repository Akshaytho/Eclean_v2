/**
 * BuyerTaskDetailScreen
 *
 * Backend connections:
 *   GET  /api/v1/buyer/tasks/:taskId         — task + media + events + payout + worker
 *   POST /api/v1/buyer/tasks/:taskId/approve — releases payment, task → APPROVED
 *   POST /api/v1/buyer/tasks/:taskId/reject  — task → REJECTED, worker can retry
 *   POST /api/v1/buyer/tasks/:taskId/rate    — after approval only
 *   Socket room: join_task_room / task:updated / task:photo_added
 *
 * Key rules from backend:
 *   - approve/reject only when status = SUBMITTED or VERIFIED
 *   - reject requires reason string (min 10 chars per PDF spec)
 *   - worker field is now included from backend (fixed above)
 *   - aiScore is 0-100 integer, aiReasoning is text string
 */
import React, { useRef, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal, TextInput, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import {
  ChevronLeft, MapPin, MessageCircle,
  CheckCircle, XCircle, Navigation, Star, Clock,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBadge }    from '../../components/ui/Badge'
import { Button }         from '../../components/ui/Button'
import { COLORS }         from '../../constants/colors'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { buyerTasksApi }  from '../../api/tasks.api'
import { referencePointsApi } from '../../api/referencePoints.api'
import { useSocketStore } from '../../stores/socketStore'
import { formatMoney }    from '../../utils/formatMoney'
import { timeAgo }        from '../../utils/timeAgo'
import type { BuyerStackParamList } from '../../navigation/types'
import type { TaskStatus, TaskReferencePoint } from '../../types'

type Nav   = NativeStackNavigationProp<BuyerStackParamList, 'BuyerTaskDetail'>
type Route = RouteProp<BuyerStackParamList, 'BuyerTaskDetail'>

// ─── Status timeline steps ─────────────────────────────────────────────────
const TIMELINE: { status: TaskStatus; label: string }[] = [
  { status: 'OPEN',        label: 'Posted' },
  { status: 'ACCEPTED',    label: 'Accepted' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'SUBMITTED',   label: 'Submitted' },
  { status: 'APPROVED',    label: 'Approved' },
]

const STATUS_ORDER: Record<string, number> = {
  OPEN: 0, ACCEPTED: 1, IN_PROGRESS: 2,
  SUBMITTED: 3, VERIFIED: 3, APPROVED: 4, COMPLETED: 4,
  REJECTED: 3, DISPUTED: 3, CANCELLED: 0,
}

// ─── AI score label ────────────────────────────────────────────────────────
function aiLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: 'EXCELLENT', color: '#16A34A' }
  if (score >= 70) return { text: 'GOOD',      color: B.primary }
  if (score >= 50) return { text: 'UNCERTAIN', color: '#D97706' }
  return              { text: 'POOR',      color: B.status.error }
}

export function BuyerTaskDetailScreen() {
  const navigation   = useNavigation<Nav>()
  const route        = useRoute<Route>()
  const { taskId }   = route.params
  const qc           = useQueryClient()
  const isActing     = useRef(false)
  const insets       = useSafeAreaInsets()
  const { socket, joinTask, leaveTask } = useSocketStore()

  // Reject modal state
  const [rejectModal,  setRejectModal]  = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  // Cancel modal state
  const [cancelModal,  setCancelModal]  = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // Full-screen photo viewer
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // ── Fetch task (includes worker, media, events, payout) ────────────────
  const { data: task, isLoading, refetch } = useQuery({
    queryKey:    ['buyer-task', taskId],
    queryFn:     () => buyerTasksApi.getTask(taskId),
    staleTime:   10_000,
    refetchInterval: 30_000, // auto-refresh every 30s for active tasks
  })

  // ── Fetch reference points (if any) ────────────────────────────────────
  const { data: refPoints } = useQuery({
    queryKey:  ['reference-points', taskId],
    queryFn:   () => referencePointsApi.list(taskId),
    staleTime: 60_000,
    enabled:   !!task, // only fetch after task loads
  })

  // ── Join socket room — listen for live updates ─────────────────────────
  useEffect(() => {
    joinTask(taskId)
    const onUpdated    = () => refetch()
    const onPhotoAdded = () => refetch()          // worker uploaded a new photo
    socket?.on('task:updated',     onUpdated)
    socket?.on('task:photo_added', onPhotoAdded)
    return () => {
      socket?.off('task:updated',     onUpdated)
      socket?.off('task:photo_added', onPhotoAdded)
      leaveTask(taskId)
    }
  }, [taskId, socket])

  // ── Approve mutation ───────────────────────────────────────────────────
  // Backend: POST /buyer/tasks/:taskId/approve
  // Effect: releases escrow, creates Razorpay payout, task → APPROVED
  const approveMutation = useMutation({
    mutationFn: () => buyerTasksApi.approve(taskId),
    onMutate:   () => { isActing.current = true },
    onSettled:  () => { isActing.current = false },
    onSuccess:  () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      qc.invalidateQueries({ queryKey: ['buyer-tasks-active'] })
      const workerPay = formatMoney(Math.floor((task?.rateCents ?? 0) * 9 / 10))
      Alert.alert(
        'Approved!',
        `${workerPay} sent to worker. Task complete.`,
        [{ text: 'Rate Worker', onPress: () => navigation.navigate('Rating', { taskId }) },
         { text: 'Done' }],
      )
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not approve')
    },
  })

  // ── Reject mutation ────────────────────────────────────────────────────
  // Backend: POST /buyer/tasks/:taskId/reject { reason }
  // Effect: task → REJECTED, worker can retry or dispute
  const rejectMutation = useMutation({
    mutationFn: (reason: string) => buyerTasksApi.reject(taskId, reason),
    onMutate:   () => { isActing.current = true },
    onSettled:  () => { isActing.current = false },
    onSuccess:  () => {
      setRejectModal(false)
      setRejectReason('')
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      Alert.alert('Rejected', 'Worker has been notified and can re-submit.')
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not reject')
    },
  })

  // ── Cancel mutation (buyer cancels own task) ───────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => buyerTasksApi.cancel(taskId, reason),
    onSuccess: () => {
      setCancelModal(false)
      setCancelReason('')
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      qc.invalidateQueries({ queryKey: ['buyer-tasks'] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert('Task Cancelled', 'Your task has been cancelled. A refund will be processed.')
      navigation.goBack()
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not cancel task')
    },
  })

  const handleCancelSubmit = () => {
    const reason = cancelReason.trim()
    if (reason.length < 10) {
      Alert.alert('Too short', 'Please provide at least 10 characters.')
      return
    }
    cancelMutation.mutate(reason)
  }

  const handleApprove = () => {
    if (isActing.current) return
    isActing.current = true
    Alert.alert(
      'Approve & Release Payment?',
      `${formatMoney(task?.rateCents ?? 0)} will be released to the worker immediately.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { isActing.current = false } },
        { text: 'Approve & Pay', onPress: () => approveMutation.mutate() },
      ],
      { cancelable: false },
    )
  }

  const handleRejectSubmit = () => {
    const reason = rejectReason.trim()
    if (reason.length < 10) {
      Alert.alert('Too short', 'Please give at least 10 characters of feedback.')
      return
    }
    rejectMutation.mutate(reason)
  }

  if (isLoading || !task) {
    return <View style={s.loading}><ActivityIndicator size="large" color={B.primary} /></View>
  }

  const canAct      = task.status === 'SUBMITTED' || task.status === 'VERIFIED'
  const currentStep = STATUS_ORDER[task.status] ?? 0

  // Photos grouped by type
  const beforePhotos = (task.media ?? []).filter((m: any) => m.type === 'BEFORE')
  const afterPhotos  = (task.media ?? []).filter((m: any) => m.type === 'AFTER')
  const proofPhotos  = (task.media ?? []).filter((m: any) => m.type === 'PROOF')

  return (
    <View style={s.root}>

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={B.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{task.title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Status timeline ── */}
        <View style={s.timeline}>
          {TIMELINE.map((step, i) => {
            const done    = currentStep > i
            const current = currentStep === i
            const isLast  = i === TIMELINE.length - 1
            return (
              <View key={step.status} style={s.timelineItem}>
                <View style={s.timelineDotCol}>
                  <View style={[
                    s.timelineDot,
                    done    && s.timelineDotDone,
                    current && s.timelineDotCurrent,
                  ]}>
                    {done && <CheckCircle size={12} color="#fff" />}
                  </View>
                  {!isLast && <View style={[s.timelineLine, done && s.timelineLineDone]} />}
                </View>
                <Text style={[s.timelineLabel, (done || current) && s.timelineLabelActive]}>
                  {step.label}
                </Text>
              </View>
            )
          })}
        </View>

        {/* ── Price + status ── */}
        <View style={s.topRow}>
          <View>
            <Text style={s.price}>{formatMoney(task.rateCents)}</Text>
            <Text style={s.updated}>Updated {timeAgo(task.updatedAt)}</Text>
          </View>
          <StatusBadge status={task.status} />
        </View>

        {/* ── Live track button (IN_PROGRESS only) ── */}
        {task.status === 'IN_PROGRESS' && task.workerId && (
          <TouchableOpacity
            style={s.trackBtn}
            onPress={() => navigation.navigate('LiveTrack', { taskId })}
            activeOpacity={0.85}
          >
            <Navigation size={18} color={B.primary} />
            <Text style={s.trackBtnText}>Track Worker Live</Text>
          </TouchableOpacity>
        )}

        {/* ── AI Score Card ── */}
        {task.aiScore != null && (
          <View style={[s.aiCard, { borderLeftColor: aiLabel(task.aiScore).color }]}>
            <View style={s.aiCardHeader}>
              <View>
                <Text style={s.aiCardTitle}>AI Verification Score</Text>
                <View style={[s.aiBadge, { backgroundColor: aiLabel(task.aiScore).color + '20' }]}>
                  <Text style={[s.aiBadgeText, { color: aiLabel(task.aiScore).color }]}>
                    {aiLabel(task.aiScore).text}
                  </Text>
                </View>
              </View>
              <Text style={[s.aiScoreNum, { color: aiLabel(task.aiScore).color }]}>
                {task.aiScore}%
              </Text>
            </View>
            {task.aiReasoning && (
              <Text style={s.aiReasoning}>{task.aiReasoning}</Text>
            )}
            <Text style={s.aiNote}>
              {task.aiScore >= 70 ? '✅ AI recommends approval' : '⚠️ AI flagged quality concerns — review photos carefully'}
            </Text>
          </View>
        )}

        {/* ── Reference Point Pairs (new flow) ── */}
        {refPoints && refPoints.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Reference Point Pairs</Text>
            {refPoints.map((point: TaskReferencePoint) => {
              const afterSub = point.workerSubmissions?.find((ws) => ws.mediaType === 'AFTER' || ws.mediaType === 'VERIFICATION')
              return (
                <View key={point.id} style={s.refPairCard}>
                  <View style={s.refPairHeader}>
                    <Text style={s.refPairLabel}>
                      Point {point.pointIndex}{point.label ? ` · ${point.label}` : ''}
                    </Text>
                    {point.isVerificationPoint && (
                      <View style={s.verifyBadge}>
                        <Text style={s.verifyBadgeText}>VERIFY</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.refPairImages}>
                    <TouchableOpacity onPress={() => setPhotoUrl(point.buyerImageUrl)} style={s.refPairImgWrap}>
                      <Image source={{ uri: point.buyerImageUrl }} style={s.refPairImg} />
                      <Text style={s.refPairImgLabel}>Before</Text>
                    </TouchableOpacity>
                    <Text style={s.refPairArrow}>{'\u2192'}</Text>
                    {afterSub ? (
                      <TouchableOpacity onPress={() => setPhotoUrl(afterSub.imageUrl)} style={s.refPairImgWrap}>
                        <Image source={{ uri: afterSub.imageUrl }} style={s.refPairImg} />
                        <Text style={s.refPairImgLabel}>After</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[s.refPairImgWrap, s.refPairImgEmpty]}>
                        <Text style={s.refPairEmptyText}>Pending</Text>
                      </View>
                    )}
                  </View>
                  {afterSub?.locationMatchScore != null && (
                    <Text style={[
                      s.refPairScore,
                      { color: afterSub.locationMatchScore >= 75 ? '#16A34A' : afterSub.locationMatchScore >= 50 ? '#D97706' : B.status.error },
                    ]}>
                      GPS match: {afterSub.locationMatchScore}/100
                    </Text>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* ── Photo evidence grid (legacy) ── */}
        {(beforePhotos.length > 0 || afterPhotos.length > 0 || proofPhotos.length > 0) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Photo Evidence</Text>
            {[
              { label: 'Before', photos: beforePhotos },
              { label: 'After',  photos: afterPhotos },
              { label: 'Proof',  photos: proofPhotos },
            ].map(({ label, photos }) => photos.length > 0 && (
              <View key={label} style={s.photoGroup}>
                <Text style={s.photoGroupLabel}>{label}</Text>
                <View style={s.photoRow}>
                  {photos.map((photo: any) => (
                    <TouchableOpacity
                      key={photo.id}
                      onPress={() => setPhotoUrl(photo.url)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: photo.url }} style={s.photoThumb} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Worker info ── */}
        {task.worker && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Worker</Text>
            <View style={s.workerRow}>
              <View style={s.workerAvatar}>
                <Text style={s.workerInitial}>{task.worker.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.workerName}>{task.worker.name}</Text>
                <Text style={s.workerEmail}>{task.worker.email}</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('Chat', { taskId, title: task.title })}
                style={s.chatBtn}
              >
                <MessageCircle size={20} color={B.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Task description ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Task Details</Text>
          <Text style={s.desc}>{task.description}</Text>
          {task.locationAddress && (
            <View style={s.locationRow}>
              <MapPin size={14} color={B.text.secondary} />
              <Text style={s.location}>{task.locationAddress}</Text>
            </View>
          )}
          {task.startedAt && (
            <View style={s.locationRow}>
              <Clock size={14} color={B.text.secondary} />
              <Text style={s.location}>
                Started {timeAgo(task.startedAt)}
                {task.timeSpentSecs && ` · ${Math.round(task.timeSpentSecs / 60)} min on site`}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Approve / Reject footer ── */}
      {canAct && (
        <View style={s.footer}>
          <Button
            label="Reject"
            onPress={() => { isActing.current = false; setRejectModal(true) }}
            variant="danger"
            style={s.footerBtn}
          />
          <Button
            label={approveMutation.isPending ? 'Approving...' : 'Approve & Pay'}
            onPress={handleApprove}
            loading={approveMutation.isPending}
            style={s.footerBtn}
          />
        </View>
      )}

      {/* ── Cancel button (OPEN / ACCEPTED / IN_PROGRESS) ── */}
      {(task.status === 'OPEN' || task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS') && !canAct && (
        <View style={s.footer}>
          <Button
            label="Cancel Task"
            onPress={() => setCancelModal(true)}
            variant="danger"
            fullWidth
          />
        </View>
      )}

      {/* ── Rate worker (after approval) ── */}
      {(task.status === 'APPROVED' || task.status === 'COMPLETED') && (
        <View style={s.footer}>
          <Button
            label="Rate Worker"
            onPress={() => navigation.navigate('Rating', { taskId })}
            fullWidth
            variant="secondary"
          />
        </View>
      )}

      {/* ── Reject reason modal ── */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => { setRejectModal(false); setRejectReason('') }}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setRejectModal(false); setRejectReason('') }} />
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Why are you rejecting?</Text>
            <Text style={s.modalSub}>
              Your feedback helps the worker improve. Min 10 characters required.
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. The drain is still partially blocked, photos are unclear..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              placeholderTextColor={B.text.muted}
              autoFocus
            />
            <Text style={s.charCount}>{rejectReason.length} / 10 min</Text>
            <View style={s.modalBtns}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => { setRejectModal(false); setRejectReason('') }}
                style={{ flex: 1 }}
              />
              <Button
                label={rejectMutation.isPending ? 'Sending...' : 'Submit Rejection'}
                onPress={handleRejectSubmit}
                loading={rejectMutation.isPending}
                variant="danger"
                style={{ flex: 2 } as any}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Cancel reason modal ── */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => { setCancelModal(false); setCancelReason('') }}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setCancelModal(false); setCancelReason('') }} />
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Cancel this task?</Text>
            <Text style={s.modalSub}>
              {task?.workerId
                ? 'The assigned worker will be notified. The task will be available for other workers.'
                : 'A refund will be processed.'}
              {' '}Min 10 characters required.
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder="Reason for cancellation..."
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              numberOfLines={4}
              placeholderTextColor={B.text.muted}
            />
            <View style={s.modalBtns}>
              <Button
                label="Keep Task"
                variant="ghost"
                onPress={() => { setCancelModal(false); setCancelReason('') }}
                style={{ flex: 1 }}
              />
              <Button
                label={cancelMutation.isPending ? 'Cancelling...' : 'Cancel Task'}
                onPress={handleCancelSubmit}
                loading={cancelMutation.isPending}
                variant="danger"
                style={{ flex: 2 } as any}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Full-screen photo viewer ── */}
      <Modal visible={!!photoUrl} transparent animationType="fade">
        <TouchableOpacity
          style={s.photoModal}
          onPress={() => setPhotoUrl(null)}
          activeOpacity={1}
        >
          {photoUrl && (
            <Image
              source={{ uri: photoUrl }}
              style={s.photoFull}
              resizeMode="contain"
            />
          )}
          <Text style={s.photoModalHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>

    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: B.surface },
  loading:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: B.border },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: B.text.primary, textAlign: 'center' },

  // Timeline
  timeline:         { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: B.background, borderBottomWidth: 1, borderBottomColor: B.border },
  timelineItem:     { flex: 1, alignItems: 'center', gap: 4 },
  timelineDotCol:   { alignItems: 'center' },
  timelineDot:      { width: 22, height: 22, borderRadius: 11, backgroundColor: B.border, alignItems: 'center', justifyContent: 'center' },
  timelineDotDone:  { backgroundColor: B.primary },
  timelineDotCurrent:{ backgroundColor: B.primary, borderWidth: 2, borderColor: COLORS.brand.light },
  timelineLine:     { width: 2, height: 16, backgroundColor: B.border },
  timelineLineDone: { backgroundColor: B.primary },
  timelineLabel:    { fontSize: 9, color: B.text.muted, fontWeight: '500', textAlign: 'center' },
  timelineLabelActive: { color: B.primary },

  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  price:       { fontSize: 26, fontWeight: '800', color: B.primary },
  updated:     { fontSize: 12, color: B.text.muted, marginTop: 2 },

  trackBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 16, backgroundColor: B.primaryTint, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: B.primary },
  trackBtnText:{ fontSize: 15, fontWeight: '700', color: B.primary },

  // AI card
  aiCard:       { marginHorizontal: 20, marginBottom: 16, backgroundColor: B.background, borderRadius: 14, padding: 16, borderLeftWidth: 4 },
  aiCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  aiCardTitle:  { fontSize: 13, fontWeight: '700', color: B.text.secondary, marginBottom: 6 },
  aiBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  aiBadgeText:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  aiScoreNum:   { fontSize: 36, fontWeight: '800' },
  aiReasoning:  { fontSize: 13, color: B.text.secondary, lineHeight: 20, marginBottom: 8 },
  aiNote:       { fontSize: 12, fontWeight: '600', color: B.text.secondary },

  // Photos
  section:       { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: B.text.primary, marginBottom: 12 },
  photoGroup:    { marginBottom: 12 },
  photoGroupLabel:{ fontSize: 12, fontWeight: '600', color: B.text.secondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  photoRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoThumb:    { width: 90, height: 90, borderRadius: 10, backgroundColor: B.primaryTint },

  // Worker
  workerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: B.background, borderRadius: 14, padding: 14 },
  workerAvatar:  { width: 44, height: 44, borderRadius: 22, backgroundColor: B.primary, alignItems: 'center', justifyContent: 'center' },
  workerInitial: { fontSize: 20, fontWeight: '700', color: '#fff' },
  workerName:    { fontSize: 15, fontWeight: '700', color: B.text.primary },
  workerEmail:   { fontSize: 12, color: B.text.secondary, marginTop: 2 },
  chatBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: B.primaryTint, alignItems: 'center', justifyContent: 'center' },

  desc:          { fontSize: 14, color: B.text.secondary, lineHeight: 22 },
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  location:      { fontSize: 13, color: B.text.secondary, flex: 1 },

  footer:        { flexDirection: 'row', gap: 12, padding: 20, backgroundColor: B.surface, borderTopWidth: 1, borderTopColor: B.border },
  footerBtn:     { flex: 1 },

  // Reject modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:      { backgroundColor: B.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: B.text.primary, marginBottom: 6 },
  modalSub:      { fontSize: 13, color: B.text.secondary, marginBottom: 16 },
  modalInput:    { backgroundColor: B.background, borderWidth: 1.5, borderColor: B.border, borderRadius: 12, padding: 14, fontSize: 14, color: B.text.primary, height: 110, textAlignVertical: 'top' },
  charCount:     { fontSize: 11, color: B.text.muted, textAlign: 'right', marginTop: 4, marginBottom: 16 },
  modalBtns:     { flexDirection: 'row', gap: 12 },

  // Photo viewer
  photoModal:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  photoFull:     { width: '100%', height: '85%' },
  photoModalHint:{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 16 },
  // Reference point pairs
  refPairCard:    { backgroundColor: B.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: B.border },
  refPairHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  refPairLabel:   { fontSize: 14, fontWeight: '600', color: B.text.primary },
  verifyBadge:    { backgroundColor: '#7C3AED20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  verifyBadgeText:{ fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  refPairImages:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refPairImgWrap: { flex: 1, alignItems: 'center' },
  refPairImg:     { width: '100%', height: 90, borderRadius: 10 },
  refPairImgLabel:{ fontSize: 10, color: B.text.muted, fontWeight: '600', marginTop: 4 },
  refPairArrow:   { fontSize: 18, color: B.text.muted },
  refPairImgEmpty:{ height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: B.border, borderStyle: 'dashed' as any, alignItems: 'center', justifyContent: 'center' },
  refPairEmptyText:{ fontSize: 12, color: B.text.muted },
  refPairScore:   { fontSize: 12, fontWeight: '600', marginTop: 8 },
})
