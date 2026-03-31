/**
 * ActiveTaskScreen — Redesigned with two clear states:
 *
 * ACCEPTED: "Ola navigating to pickup" — map + navigate + start work
 * IN_PROGRESS: "Zomato order tracking" — progress steps + FindMyArrow + capture
 *
 * No legacy 3-photo flow. Only reference points flow.
 * Motion tracking starts here (not ReferencePointNavigator).
 * GPS retry mechanism for geofence (3 retries, not hard block).
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Image, ActivityIndicator, ScrollView,
  TextInput, Modal, Linking, Platform,
} from 'react-native'
import MapView, { Marker, Polyline, Circle } from 'react-native-maps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import NetInfo from '@react-native-community/netinfo'
import {
  CheckCircle, Wifi, WifiOff, Play, MapPin, Clock,
  AlertTriangle, MessageCircle, Navigation2, Camera, X, Flag,
} from 'lucide-react-native'

import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi } from '../../api/tasks.api'
import { referencePointsApi } from '../../api/referencePoints.api'
import { useBackgroundLocation } from '../../hooks/useBackgroundLocation'
import { useActiveTaskStore } from '../../stores/activeTaskStore'
import { useSocketStore } from '../../stores/socketStore'
import { startMotionTracking, isMotionTrackingActive } from '../../services/motionTracker'
import { formatMoney } from '../../utils/formatMoney'
import { formatElapsed } from '../../utils/formatTime'
import { haversineKm } from '../../utils/distance'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import { FindMyArrow } from '../../components/maps/FindMyArrow'
import type { CaptureResult } from '../../components/camera/CaptureCamera'
import type { WorkerStackParamList } from '../../navigation/types'
import type { SubmissionProgress } from '../../types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList, 'ActiveTask'>
type Route = RouteProp<WorkerStackParamList, 'ActiveTask'>

const GEOFENCE_RADIUS_KM = 0.5

function openMapsNavigation(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
    android: `google.navigation:q=${lat},${lng}&mode=d`,
  })
  if (url) Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
  })
}

export function ActiveTaskScreen() {
  const navigation = useNavigation<Nav>()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const qc         = useQueryClient()
  const { joinTask, leaveTask, connected } = useSocketStore()
  const { setActiveTask, gpsTrail, elapsedSecs, setElapsedSecs } = useActiveTaskStore()
  const { currentLocation, requestPermissions, startTracking, stopTracking } = useBackgroundLocation()

  const mapRef       = useRef<MapView>(null)
  const isStarting   = useRef(false)
  const isCancelling = useRef(false)

  const [gpsRetrying, setGpsRetrying]   = useState(false)
  const gpsRetryCount                    = useRef(0)
  const [cancelModal, setCancelModal]   = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isOnline, setIsOnline]         = useState(true)
  const [cameraState, setCameraState]   = useState<{
    visible: boolean; pointId: string | null; pointIndex: number;
    label: string | null; buyerImageUrl: string | null; distance: number | null
  }>({ visible: false, pointId: null, pointIndex: 0, label: null, buyerImageUrl: null, distance: null })

  // ── Task query ────────────────────────────────────────────────────────────
  const { data: task, isLoading } = useQuery({
    queryKey: ['worker', 'task', taskId],
    queryFn:  () => workerTasksApi.getTask(taskId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  // ── Submission progress (for IN_PROGRESS reference point flow) ────────────
  const { data: progress } = useQuery<SubmissionProgress>({
    queryKey: ['submission-progress', taskId, currentLocation?.lat, currentLocation?.lng],
    queryFn:  () => referencePointsApi.progress(taskId, currentLocation?.lat, currentLocation?.lng),
    enabled:  task?.status === 'IN_PROGRESS' && (task?.totalReferencePoints ?? 0) > 0,
    refetchInterval: 15_000,
  })

  // ── Network status ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true)
    })
    return () => unsubscribe()
  }, [])

  // ── Socket room ───────────────────────────────────────────────────────────
  useEffect(() => {
    joinTask(taskId)
    return () => leaveTask(taskId)
  }, [taskId])

  useEffect(() => { if (task) setActiveTask(task) }, [task])

  // ── Timer from server startedAt ───────────────────────────────────────────
  useEffect(() => {
    if (!task?.startedAt) return
    const startMs = new Date(task.startedAt).getTime()
    const tick = () => setElapsedSecs(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [task?.startedAt])

  // ── Start tracking + motion when IN_PROGRESS ─────────────────────────────
  useEffect(() => {
    if (task?.status === 'IN_PROGRESS') {
      startTracking(taskId)
      if (!isMotionTrackingActive()) startMotionTracking()
    }
  }, [task?.status])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () => workerTasksApi.start(taskId, currentLocation
      ? { lat: currentLocation.lat, lng: currentLocation.lng } : undefined),
    onSuccess: async () => {
      isStarting.current = false
      qc.invalidateQueries({ queryKey: ['worker', 'task', taskId] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const granted = await requestPermissions()
      if (granted) await startTracking(taskId)
    },
    onError: (err: any) => {
      isStarting.current = false
      const msg = err?.response?.data?.error?.message ?? ''
      if (msg && !msg.includes('already') && !msg.includes('IN_PROGRESS')) {
        Alert.alert('Cannot Start', msg)
      }
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => workerTasksApi.cancel(taskId, reason),
    onSuccess: async () => {
      await stopTracking()
      setActiveTask(null)
      qc.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as never)
    },
    onError: (err: any) => {
      isCancelling.current = false
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not cancel task')
    },
  })

  // ── Computed ──────────────────────────────────────────────────────────────
  const distanceKm = (currentLocation && task?.locationLat)
    ? haversineKm(currentLocation.lat, currentLocation.lng, task.locationLat, task.locationLng!)
    : null
  const isNearTask = distanceKm !== null && distanceKm <= GEOFENCE_RADIUS_KM
  const hasLocation = task?.locationLat != null
  const isInProgress = task?.status === 'IN_PROGRESS'
  const isAccepted   = task?.status === 'ACCEPTED'

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (isStarting.current) return
    if (!currentLocation) { Alert.alert('GPS', 'Waiting for GPS signal...'); return }
    if (hasLocation && !isNearTask) {
      if (gpsRetryCount.current < 3) {
        setGpsRetrying(true)
        gpsRetryCount.current++
        try { await requestPermissions(); await new Promise(r => setTimeout(r, 5000)) } catch {}
        setGpsRetrying(false)
        return
      }
      Alert.alert('Too Far', `You're ${distanceKm ? `${distanceKm.toFixed(1)} km` : '?'} away. Get within 500m to start.`)
      gpsRetryCount.current = 0
      return
    }
    gpsRetryCount.current = 0
    setGpsRetrying(false)
    isStarting.current = true
    startMutation.mutate()
  }

  // Find the next uncaptured reference point
  const nextPoint = progress?.points.find(p => !p.hasAfterSubmission)
  const completedCount = progress?.afterCompleted ?? 0
  const totalCount = progress?.totalPoints ?? 0

  const openCameraForPoint = useCallback((point: SubmissionProgress['points'][number]) => {
    setCameraState({
      visible: true, pointId: point.id, pointIndex: point.pointIndex,
      label: point.label, buyerImageUrl: point.buyerImageUrl, distance: point.distanceFromWorker,
    })
  }, [])

  const onCapture = useCallback(async (result: CaptureResult) => {
    setCameraState(s => ({ ...s, visible: false }))
    if (!cameraState.pointId) return
    const meta = result.photo.metadata ? {
      lat: result.photo.metadata.lat, lng: result.photo.metadata.lng,
      timestamp: result.photo.metadata.timestamp, deviceId: result.photo.metadata.deviceId,
      photoHash: result.photo.metadata.photoHash,
    } : undefined
    try {
      await referencePointsApi.submitPoint(taskId, cameraState.pointId, 'AFTER', result.photo.fullUri, meta)
    } catch {}
    qc.invalidateQueries({ queryKey: ['submission-progress', taskId] })
  }, [taskId, cameraState.pointId])

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading || !task) {
    return <View style={s.center}><ActivityIndicator color={W.primary} size="large" /></View>
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCEPTED STATE — "Ola navigating to pickup"
  // ══════════════════════════════════════════════════════════════════════════
  if (isAccepted) {
    const mapRegion = currentLocation
      ? { latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : task.locationLat
        ? { latitude: task.locationLat, longitude: task.locationLng!, latitudeDelta: 0.01, longitudeDelta: 0.01 }
        : { latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.05, longitudeDelta: 0.05 }

    return (
      <View style={s.root}>
        {/* Map — 60% of screen */}
        <View style={s.mapContainer}>
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={mapRegion} showsUserLocation>
            {task.locationLat && (
              <Marker coordinate={{ latitude: task.locationLat, longitude: task.locationLng! }} pinColor={W.primary} title="Task Location" />
            )}
          </MapView>
        </View>

        {/* Bottom card */}
        <View style={s.acceptedCard}>
          <View style={s.cardRow}>
            <Text style={s.cardTitle} numberOfLines={1}>{task.title}</Text>
            <Text style={s.cardRate}>{formatMoney(task.rateCents, 'INR')}</Text>
          </View>
          {task.locationAddress && (
            <View style={s.cardLocRow}>
              <MapPin size={12} color={W.text.muted} />
              <Text style={s.cardLoc} numberOfLines={1}>{task.locationAddress}</Text>
            </View>
          )}

          {/* Distance + ETA */}
          {distanceKm !== null && (
            <View style={s.metricsRow}>
              <View style={[s.metricBox, { backgroundColor: isNearTask ? '#DCFCE7' : '#FEF3C7' }]}>
                <Text style={[s.metricVal, { color: isNearTask ? '#15803D' : '#92400E' }]}>
                  {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)} km`}
                </Text>
                <Text style={[s.metricLabel, { color: isNearTask ? '#15803D' : '#92400E' }]}>
                  {isNearTask ? 'At location' : 'away'}
                </Text>
              </View>
              <View style={[s.metricBox, { backgroundColor: '#F0F9FF' }]}>
                <Text style={[s.metricVal, { color: '#1D4ED8' }]}>~{Math.max(1, Math.round(distanceKm * 12))} min</Text>
                <Text style={[s.metricLabel, { color: '#1D4ED8' }]}>to reach</Text>
              </View>
            </View>
          )}

          {/* Navigate button */}
          {hasLocation && !isNearTask && (
            <TouchableOpacity style={s.navigateBtn} onPress={() => openMapsNavigation(task.locationLat!, task.locationLng!)} activeOpacity={0.85}>
              <Navigation2 size={18} color="#fff" />
              <Text style={s.navigateBtnText}>NAVIGATE</Text>
            </TouchableOpacity>
          )}

          {/* GPS retry indicator */}
          {gpsRetrying && (
            <View style={s.retryBar}>
              <ActivityIndicator size="small" color={W.primary} />
              <Text style={s.retryText}>GPS retrying... ({gpsRetryCount.current}/3)</Text>
            </View>
          )}

          {/* Start Work */}
          <TouchableOpacity
            style={[s.startBtn, (!isNearTask && hasLocation) && s.btnDisabled]}
            onPress={handleStart}
            activeOpacity={0.85}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? <ActivityIndicator color="#fff" /> : (
              <>
                <Play size={18} color="#fff" />
                <Text style={s.startBtnText}>
                  {hasLocation && !isNearTask ? 'Get closer to start' : 'START WORK'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Footer: Report + Cancel */}
          <View style={s.footerActions}>
            <TouchableOpacity style={s.footerBtn} onPress={() => navigation.navigate('ReportIssue' as any, { taskId })}>
              <Flag size={14} color={W.text.muted} />
              <Text style={s.footerBtnText}>Report Issue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.footerBtn} onPress={() => setCancelModal(true)}>
              <X size={14} color={W.text.muted} />
              <Text style={s.footerBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cancel modal */}
        <CancelModal
          visible={cancelModal}
          reason={cancelReason}
          onReasonChange={setCancelReason}
          onCancel={() => setCancelModal(false)}
          onConfirm={() => {
            if (cancelReason.trim().length < 5) { Alert.alert('Reason Required', 'At least 5 characters.'); return }
            isCancelling.current = true; setCancelModal(false); cancelMutation.mutate(cancelReason.trim())
          }}
          isPending={cancelMutation.isPending}
        />
      </View>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IN_PROGRESS STATE — "Zomato order tracking" + FindMyArrow
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      {/* Header with timer */}
      <View style={s.progressHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Active Task</Text>
        <View style={s.timerChip}>
          <Clock size={14} color={W.primary} />
          <Text style={s.timerText}>{formatElapsed(elapsedSecs)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.progressContent} showsVerticalScrollIndicator={false}>

        {/* Connection status */}
        <View style={[s.connectionBar, { backgroundColor: connected ? '#DCFCE7' : '#FEF3C7' }]}>
          {connected ? <Wifi size={14} color="#15803D" /> : <WifiOff size={14} color="#92400E" />}
          <Text style={{ fontSize: 12, fontWeight: '600', color: connected ? '#15803D' : '#92400E' }}>
            {connected ? 'GPS live' : 'Reconnecting...'}
          </Text>
        </View>

        {/* Offline bar */}
        {!isOnline && (
          <View style={s.offlineBar}>
            <Text style={s.offlineText}>Offline — photos saved locally. Will sync when connected.</Text>
          </View>
        )}

        {/* Progress tracker */}
        {progress && (
          <View style={s.progressCard}>
            <View style={s.progressBarRow}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }]} />
              </View>
              <Text style={s.progressCount}>{completedCount}/{totalCount}</Text>
            </View>

            {/* Step list */}
            <View style={s.stepList}>
              <StepItem done label="Started work" />
              {progress.points.map((point) => (
                <StepItem
                  key={point.id}
                  done={point.hasAfterSubmission}
                  active={nextPoint?.id === point.id}
                  label={point.label ?? `Photo ${point.pointIndex}`}
                  subtitle={point.hasAfterSubmission && point.afterSubmission?.locationMatchScore != null
                    ? `GPS: ${point.afterSubmission.locationMatchScore}%`
                    : point.distanceFromWorker != null ? `${point.distanceFromWorker}m away` : undefined}
                  onPress={!point.hasAfterSubmission ? () => openCameraForPoint(point) : undefined}
                />
              ))}
              <StepItem
                done={false}
                active={completedCount >= totalCount}
                label="Submit work"
              />
            </View>
          </View>
        )}

        {/* FindMyArrow — for next uncaptured point */}
        {nextPoint && currentLocation && nextPoint.buyerLat != null && nextPoint.buyerLng != null && (
          <View style={s.arrowSection}>
            <Text style={s.arrowLabel}>{nextPoint.label ?? `Point ${nextPoint.pointIndex}`}</Text>
            <FindMyArrow
              targetLat={nextPoint.buyerLat}
              targetLng={nextPoint.buyerLng}
              workerLat={currentLocation.lat}
              workerLng={currentLocation.lng}
              distanceMeters={nextPoint.distanceFromWorker ?? 0}
              size={140}
            />
            <View style={s.arrowActions}>
              <TouchableOpacity style={s.captureBtn} onPress={() => openCameraForPoint(nextPoint)} activeOpacity={0.85}>
                <Camera size={20} color="#fff" />
                <Text style={s.captureBtnText}>CAPTURE THIS SPOT</Text>
              </TouchableOpacity>
              {nextPoint.buyerLat != null && (
                <TouchableOpacity
                  style={s.walkBtn}
                  onPress={() => openMapsNavigation(nextPoint.buyerLat!, nextPoint.buyerLng!)}
                  activeOpacity={0.85}
                >
                  <Navigation2 size={16} color={W.primary} />
                  <Text style={s.walkBtnText}>WALK TO SPOT</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* All points done — show submit */}
        {progress?.canSubmit && (
          <TouchableOpacity
            style={s.submitBtn}
            onPress={() => navigation.navigate('SubmitProof', { taskId })}
            activeOpacity={0.85}
          >
            <CheckCircle size={20} color="#fff" />
            <Text style={s.submitBtnText}>REVIEW & SUBMIT</Text>
          </TouchableOpacity>
        )}

        {/* Reference photo preview for next point */}
        {nextPoint && nextPoint.buyerImageUrl && (
          <View style={s.refPreview}>
            <Image source={{ uri: nextPoint.buyerImageUrl }} style={s.refImage} resizeMode="cover" />
            <Text style={s.refCaption}>Match this angle after cleaning</Text>
          </View>
        )}

        {/* Motion tracking — transparent */}
        <View style={s.motionBar}>
          <Text style={s.motionText}>Motion tracking active — helps verify your work faster</Text>
        </View>

        {/* Footer actions */}
        <View style={s.footerActions}>
          <TouchableOpacity style={s.footerBtn} onPress={() => navigation.navigate('Chat', { taskId, title: task.title })}>
            <MessageCircle size={14} color={W.primary} />
            <Text style={[s.footerBtnText, { color: W.primary }]}>Message Buyer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.footerBtn} onPress={() => navigation.navigate('ReportIssue' as any, { taskId })}>
            <Flag size={14} color={W.text.muted} />
            <Text style={s.footerBtnText}>Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.footerBtn} onPress={() => setCancelModal(true)}>
            <X size={14} color={W.text.muted} />
            <Text style={s.footerBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Camera modal */}
      <Modal visible={cameraState.visible} animationType="slide" statusBarTranslucent>
        <CaptureCamera
          taskId={taskId}
          photoType="AFTER"
          onCapture={onCapture}
          onClose={() => setCameraState(cs => ({ ...cs, visible: false }))}
          referenceImage={cameraState.buyerImageUrl}
          referenceLabel={cameraState.label}
          pointIndex={cameraState.pointIndex}
          totalPoints={totalCount}
          distanceFromPoint={cameraState.distance}
        />
      </Modal>

      {/* Cancel modal */}
      <CancelModal
        visible={cancelModal}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onCancel={() => setCancelModal(false)}
        onConfirm={() => {
          if (cancelReason.trim().length < 5) { Alert.alert('Reason Required', 'At least 5 characters.'); return }
          isCancelling.current = true; setCancelModal(false); cancelMutation.mutate(cancelReason.trim())
        }}
        isPending={cancelMutation.isPending}
      />
    </View>
  )
}

// ── Step Item (Zomato-style progress step) ──────────────────────────────────

function StepItem({ done, active, label, subtitle, onPress }: {
  done: boolean; active?: boolean; label: string; subtitle?: string;
  onPress?: () => void
}) {
  return (
    <TouchableOpacity
      style={[s.stepRow, active && s.stepRowActive]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <View style={[s.stepDot, done && s.stepDotDone, active && s.stepDotActive]}>
        {done && <CheckCircle size={16} color="#fff" />}
      </View>
      <View style={s.stepContent}>
        <Text style={[s.stepLabel, done && s.stepLabelDone]}>{label}</Text>
        {subtitle && <Text style={s.stepSub}>{subtitle}</Text>}
      </View>
      {onPress && !done && <Camera size={16} color={W.primary} />}
    </TouchableOpacity>
  )
}

// ── Cancel Modal ────────────────────────────────────────────────────────────

function CancelModal({ visible, reason, onReasonChange, onCancel, onConfirm, isPending }: {
  visible: boolean; reason: string; onReasonChange: (t: string) => void;
  onCancel: () => void; onConfirm: () => void; isPending: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Cancel this task?</Text>
          <Text style={s.modalSub}>Please tell us why (min 5 characters)</Text>
          <TextInput
            style={s.modalInput}
            value={reason}
            onChangeText={onReasonChange}
            placeholder="Reason for cancellation..."
            placeholderTextColor={W.text.muted}
            multiline
          />
          <View style={s.modalBtns}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelText}>Keep Task</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={onConfirm} disabled={isPending}>
              {isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.modalConfirmText}>Cancel Task</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: W.background },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── ACCEPTED state ──
  mapContainer:  { flex: 0.55 },
  acceptedCard:  { flex: 0.45, backgroundColor: W.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, marginTop: -16, gap: 12 },
  cardRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle:     { fontSize: 18, fontWeight: '700', color: W.text.primary, flex: 1, marginRight: 8 },
  cardRate:      { fontSize: 20, fontWeight: '800', color: W.primary },
  cardLocRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLoc:       { fontSize: 13, color: W.text.muted, flex: 1 },
  metricsRow:    { flexDirection: 'row', gap: 10 },
  metricBox:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  metricVal:     { fontSize: 16, fontWeight: '800' },
  metricLabel:   { fontSize: 11, fontWeight: '600', marginTop: 2 },
  navigateBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 14 },
  navigateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  retryBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  retryText:     { fontSize: 13, color: W.primary, fontWeight: '600' },
  startBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: W.primary, borderRadius: 12, paddingVertical: 16 },
  startBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnDisabled:   { backgroundColor: W.border },

  // ── IN_PROGRESS state ──
  progressHeader:{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: W.surface, borderBottomWidth: 1, borderBottomColor: W.border },
  backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:      { fontSize: 22, fontWeight: '700', color: W.text.primary },
  headerTitle:   { flex: 1, fontSize: 16, fontWeight: '700', color: W.text.primary, textAlign: 'center' },
  timerChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: W.primaryTint, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  timerText:     { fontSize: 14, fontWeight: '700', color: W.primary },
  progressContent: { padding: 16, gap: 16 },

  connectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, borderRadius: 8 },
  offlineBar:    { backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A' },
  offlineText:   { fontSize: 12, color: '#92400E', textAlign: 'center' },

  // Progress card
  progressCard:    { backgroundColor: W.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: W.border },
  progressBarRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressTrack:   { flex: 1, height: 6, borderRadius: 3, backgroundColor: W.border },
  progressFill:    { height: '100%', borderRadius: 3, backgroundColor: W.primary },
  progressCount:   { fontSize: 14, fontWeight: '700', color: W.text.primary },
  stepList:        { gap: 4 },

  // Steps
  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  stepRowActive:   { backgroundColor: W.primaryTint },
  stepDot:         { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: W.border, alignItems: 'center', justifyContent: 'center' },
  stepDotDone:     { backgroundColor: W.primary, borderColor: W.primary },
  stepDotActive:   { borderColor: W.primary },
  stepContent:     { flex: 1 },
  stepLabel:       { fontSize: 14, fontWeight: '600', color: W.text.primary },
  stepLabelDone:   { color: W.text.muted, textDecorationLine: 'line-through' },
  stepSub:         { fontSize: 11, color: W.text.muted, marginTop: 2 },

  // Arrow section
  arrowSection:    { alignItems: 'center', backgroundColor: W.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: W.border },
  arrowLabel:      { fontSize: 16, fontWeight: '700', color: W.text.primary, marginBottom: 12 },
  arrowActions:    { width: '100%', gap: 10, marginTop: 16 },
  captureBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: W.primary, borderRadius: 12, paddingVertical: 16 },
  captureBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  walkBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: W.primary, borderRadius: 12, paddingVertical: 14 },
  walkBtnText:     { fontSize: 14, fontWeight: '700', color: W.primary },

  // Submit
  submitBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: W.primary, borderRadius: 14, paddingVertical: 18 },
  submitBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Reference preview
  refPreview:      { alignItems: 'center', gap: 8 },
  refImage:        { width: '100%', height: 180, borderRadius: 14 },
  refCaption:      { fontSize: 12, color: W.text.muted, fontStyle: 'italic' },

  // Motion bar
  motionBar:       { backgroundColor: '#F0F9FF', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  motionText:      { fontSize: 12, color: '#1E40AF', textAlign: 'center' },

  // Footer
  footerActions:   { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 8 },
  footerBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12 },
  footerBtnText:   { fontSize: 12, color: W.text.muted },

  // Cancel modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard:       { backgroundColor: W.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle:      { fontSize: 18, fontWeight: '700', color: W.text.primary },
  modalSub:        { fontSize: 13, color: W.text.muted, marginTop: 4 },
  modalInput:      { borderWidth: 1, borderColor: W.border, borderRadius: 10, padding: 14, marginTop: 16, minHeight: 80, fontSize: 14, color: W.text.primary, textAlignVertical: 'top' },
  modalBtns:       { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn:  { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: W.border },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: W.text.secondary },
  modalConfirmBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444' },
  modalConfirmText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
})
