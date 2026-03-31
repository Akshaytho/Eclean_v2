import React, { useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Image, Modal, Dimensions,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { ArrowLeft, MapPin, Clock, DollarSign, Briefcase, AlertTriangle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { COLORS } from '../../constants/colors'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { DIRTY_LEVELS } from '../../constants/taskCategories'
import { workerTasksApi } from '../../api/tasks.api'
import { referencePointsApi } from '../../api/referencePoints.api'
import { formatMoney } from '../../utils/formatMoney'
import { useSocketStore } from '../../stores/socketStore'
import type { WorkerStackParamList } from '../../navigation/types'
import type { DirtyLevel, TaskReferencePoint } from '../../types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList, 'TaskDetail'>
type Route = RouteProp<WorkerStackParamList, 'TaskDetail'>

const DIRTY_COLOR: Record<DirtyLevel, string> = {
  LIGHT:    COLORS.dirty.light,
  MEDIUM:   COLORS.dirty.medium,
  HEAVY:    COLORS.dirty.heavy,
  CRITICAL: COLORS.dirty.critical,
}

export function TaskDetailScreen() {
  const navigation    = useNavigation<Nav>()
  const route         = useRoute<Route>()
  const { taskId }    = route.params
  const queryClient   = useQueryClient()
  const { joinTask }  = useSocketStore()

  const isAccepting = useRef(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const { data: task, isLoading, error } = useQuery({
    queryKey: ['worker', 'task', taskId],
    queryFn:  () => workerTasksApi.getTask(taskId),
  })

  const acceptMutation = useMutation({
    mutationFn: () => workerTasksApi.accept(taskId),
    onSuccess: (acceptedTask) => {
      queryClient.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      joinTask(taskId)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      navigation.replace('ActiveTask', { taskId })
    },
    onError: (err: any) => {
      isAccepting.current = false
      const msg = err?.response?.data?.error?.message ?? 'Could not accept task'
      setErrorMsg(msg)
    },
  })

  const handleAccept = () => {
    setConfirmOpen(true)
  }

  const confirmAccept = () => {
    if (isAccepting.current) return
    isAccepting.current = true
    setConfirmOpen(false)
    acceptMutation.mutate()
  }

  // Fetch reference point photos (buyer's documentation)
  // Must be before early returns to satisfy React hooks rules
  const { data: refPoints } = useQuery<TaskReferencePoint[]>({
    queryKey: ['reference-points', taskId],
    queryFn:  () => referencePointsApi.list(taskId),
    enabled:  !!task && (task.totalReferencePoints ?? 0) > 0,
  })

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={W.primary} size="large" />
      </View>
    )
  }

  if (error || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const hasLocation = task.locationLat != null && task.locationLng != null
  const dirtyColor  = DIRTY_COLOR[task.dirtyLevel]

  return (
    <View style={styles.container}>
      {/* ── Back header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={W.text.primary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{task.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* ── Hero: Reference Photos (Swiggy-style swipeable gallery) ── */}
        {refPoints && refPoints.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.heroGallery}
            >
              {refPoints.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.95}
                  onPress={() => setPreviewUrl(p.buyerImageUrl)}
                >
                  <Image
                    source={{ uri: p.buyerImageUrl }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.heroDots}>
              {refPoints.map((_, i) => (
                <View key={i} style={[styles.heroDot, i === 0 && styles.heroDotActive]} />
              ))}
            </View>
          </View>
        ) : task.media?.filter(m => m.type === 'REFERENCE').length ? (
          <Image
            source={{ uri: task.media.filter(m => m.type === 'REFERENCE')[0].url }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : null}

        {/* ── Task Info ── */}
        <View style={styles.taskInfo}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {task.locationAddress && (
            <View style={styles.locRow}>
              <MapPin size={14} color={W.text.muted} />
              <Text style={styles.locText}>{task.locationAddress}</Text>
            </View>
          )}
          {task.buyer && (
            <Text style={styles.buyerName}>{task.buyer.name}</Text>
          )}
        </View>

        {/* ── Mini Map (for workers coming from notifications) ── */}
        {hasLocation && (
          <MapView
            style={styles.miniMap}
            initialRegion={{
              latitude: task.locationLat!, longitude: task.locationLng!,
              latitudeDelta: 0.008, longitudeDelta: 0.008,
            }}
            scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}
          >
            <Marker coordinate={{ latitude: task.locationLat!, longitude: task.locationLng! }} pinColor={dirtyColor} />
          </MapView>
        )}

        {/* ── Info Chips (rate, dirty level, photo count) ── */}
        <View style={styles.chipsRow}>
          <View style={[styles.infoChip, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.chipAmount, { color: '#15803D' }]}>{formatMoney(task.rateCents, 'INR')}</Text>
            <Text style={[styles.chipLabel, { color: '#15803D' }]}>Earning</Text>
          </View>
          <View style={[styles.infoChip, { backgroundColor: dirtyColor + '20' }]}>
            <View style={[styles.dirtyBadge, { backgroundColor: dirtyColor }]}>
              <Text style={styles.dirtyText}>{task.dirtyLevel}</Text>
            </View>
          </View>
          {(task.totalReferencePoints ?? 0) > 0 && (
            <View style={[styles.infoChip, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.chipAmount, { color: '#1D4ED8' }]}>{task.totalReferencePoints}</Text>
              <Text style={[styles.chipLabel, { color: '#1D4ED8' }]}>Photos</Text>
            </View>
          )}
        </View>

        {/* ── Description ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <Text style={styles.description}>{task.description}</Text>
        </View>

        {/* ── Details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <DetailRow icon={<Briefcase size={16} color={W.text.secondary} />} label="Category" value={task.category.replace(/_/g, ' ')} />
          <DetailRow icon={<AlertTriangle size={16} color={W.text.secondary} />} label="Urgency" value={task.urgency} />
          {task.locationAddress && (
            <DetailRow icon={<MapPin size={16} color={W.text.secondary} />} label="Location" value={task.locationAddress} />
          )}
          {task.workWindowStart && (
            <DetailRow
              icon={<Clock size={16} color={W.text.secondary} />}
              label="Work Window"
              value={`${task.workWindowStart} – ${task.workWindowEnd}`}
            />
          )}
          {task.buyer && (
            <DetailRow icon={<Briefcase size={16} color={W.text.secondary} />} label="Posted by" value={task.buyer.name} />
          )}
        </View>
      </ScrollView>

      {/* ── Error Banner ── */}
      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
          {errorMsg.toLowerCase().includes('active task') && (
            <TouchableOpacity
              style={styles.errorAction}
              onPress={() => {
                setErrorMsg(null)
                navigation.navigate('WorkerTabs' as any)
              }}
            >
              <Text style={styles.errorActionText}>Go to My Tasks</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setErrorMsg(null)} style={styles.errorDismiss}>
            <Text style={styles.errorDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Footer Button ── */}
      <View style={styles.footer}>
        {task.status === 'OPEN' ? (
          <TouchableOpacity
            style={[styles.acceptBtn, acceptMutation.isPending && styles.acceptBtnDisabled]}
            onPress={handleAccept}
            activeOpacity={0.85}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>ACCEPT TASK — EARN {formatMoney(task.rateCents, 'INR')}</Text>
            )}
          </TouchableOpacity>
        ) : (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS') ? (
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => navigation.replace('ActiveTask', { taskId })}
            activeOpacity={0.85}
          >
            <Text style={styles.acceptBtnText}>
              {task.status === 'IN_PROGRESS' ? 'Continue Working' : 'Go to Task'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Accept confirmation sheet */}
      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setConfirmOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.confirmSheet}>
            <View style={styles.confirmHandle} />
            <Text style={styles.confirmTitle}>Accept this task?</Text>
            <Text style={styles.confirmSub}>{task?.title}</Text>
            <View style={styles.confirmPriceRow}>
              <Text style={styles.confirmPriceLabel}>You'll earn</Text>
              <Text style={styles.confirmPrice}>{formatMoney(task?.rateCents ?? 0, 'INR')}</Text>
            </View>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.confirmCancelText}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmAccept}
                onPress={confirmAccept}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmAcceptText}>Accept Task</Text>
                }
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Fullscreen photo preview ── */}
      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreviewUrl(null)}>
          {previewUrl && (
            <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
          )}
          <Text style={styles.previewHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      {icon}
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: W.background },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:      { fontSize: 16, color: W.text.secondary, marginBottom: 12 },
  backLink:       { color: W.primary, fontSize: 15, fontWeight: '600' },
  topBar:         {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: W.surface,
    borderBottomWidth: 1,
    borderBottomColor: W.border,
  },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle:    { flex: 1, fontSize: 17, fontWeight: '700', color: W.text.primary, textAlign: 'center' },
  content:        { padding: 16, paddingBottom: 32, gap: 12 },
  // Mini map
  miniMap:        { height: 120, borderRadius: 12, overflow: 'hidden' },
  // Hero gallery (Swiggy-style full-width swipeable)
  heroGallery:    { height: 220 },
  heroImage:      { width: Dimensions.get('window').width - 32, height: 220, borderRadius: 14, marginHorizontal: 16 },
  heroDots:       { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  heroDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: W.border },
  heroDotActive:  { backgroundColor: W.primary, width: 20 },
  // Task info
  taskInfo:       { paddingHorizontal: 4, gap: 4 },
  taskTitle:      { fontSize: 22, fontWeight: '800', color: W.text.primary },
  locRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText:        { fontSize: 13, color: W.text.muted },
  buyerName:      { fontSize: 13, color: W.text.secondary },
  // Info chips
  chipsRow:       { flexDirection: 'row', gap: 10 },
  infoChip:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  chipAmount:     { fontSize: 18, fontWeight: '800' },
  chipLabel:      { fontSize: 11, fontWeight: '600', marginTop: 2 },
  // Fullscreen photo preview
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  previewImage:   { width: '100%', height: '80%', borderRadius: 12 },
  previewHint:    { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 16 },
  rateCard:       {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: W.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  rateAmount:     { fontSize: 24, fontWeight: '800', color: W.primary, flex: 1 },
  dirtyBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dirtyText:      { fontSize: 12, fontWeight: '700', color: '#fff' },
  card:           {
    backgroundColor: W.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle:      { fontSize: 14, fontWeight: '700', color: W.text.secondary, marginBottom: 4 },
  description:    { fontSize: 14, color: W.text.secondary, lineHeight: 20 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailLabel:    { fontSize: 13, color: W.text.secondary, width: 90 },
  detailValue:    { fontSize: 13, color: W.text.primary, flex: 1, fontWeight: '500' },
  footer:         {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: W.surface,
    borderTopWidth: 1,
    borderTopColor: W.border,
  },
  acceptBtn:      {
    backgroundColor: W.primary,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner:     { backgroundColor: '#FEF2F2', borderTopWidth: 1, borderTopColor: '#FECACA', paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  errorBannerText: { fontSize: 14, fontWeight: '600', color: '#991B1B' },
  errorAction:     { backgroundColor: W.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  errorActionText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  errorDismiss:    { alignItems: 'center', paddingVertical: 4 },
  errorDismissText:{ fontSize: 13, color: W.text.muted },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  confirmSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 40 },
  confirmHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  confirmTitle:   { fontSize: 20, fontWeight: '800', color: W.text.primary },
  confirmSub:     { fontSize: 14, color: W.text.secondary, marginTop: 4 },
  confirmPriceRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 12, padding: 16, marginTop: 16 },
  confirmPriceLabel: { fontSize: 14, color: '#15803D', fontWeight: '600' },
  confirmPrice:   { fontSize: 24, fontWeight: '800', color: '#15803D' },
  confirmBtns:    { flexDirection: 'row', gap: 12, marginTop: 20 },
  confirmCancel:  { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  confirmCancelText: { fontSize: 15, fontWeight: '600', color: W.text.secondary },
  confirmAccept:  { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: W.primary },
  confirmAcceptText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
