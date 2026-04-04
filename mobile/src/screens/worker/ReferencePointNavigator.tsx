/**
 * ReferencePointNavigator — Worker's main screen during reference-point tasks.
 * Shows list of buyer reference points, tracks capture progress,
 * opens side-by-side camera for each point.
 *
 * Replaces the 3-photo section of ActiveTaskScreen when task has reference points.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, Modal, ActivityIndicator, Linking, Platform,
} from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import {
  ChevronLeft, CheckCircle, Lock, Camera as CameraIcon, MapPin, Navigation2,
} from 'lucide-react-native'
import * as Location from 'expo-location'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { WORKER_THEME as W } from '../../constants/workerTheme'
import { CachedImage } from '../../components/ui/CachedImage'
import { referencePointsApi } from '../../api/referencePoints.api'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import type { CaptureResult, PhotoType } from '../../components/camera/CaptureCamera'
import type { WorkerStackParamList } from '../../navigation/types'
import type { SubmissionProgress } from '../../types'
import { useActiveTaskStore } from '../../stores/activeTaskStore'
import { formatElapsed } from '../../utils/formatTime'
import { useEnvironmentalDNA } from '../../hooks/useEnvironmentalDNA'
import { stopMotionTracking } from '../../services/motionTracker'
import { apiClient } from '../../api/client'

type Nav   = NativeStackNavigationProp<WorkerStackParamList, 'ReferencePoints'>
type Route = RouteProp<WorkerStackParamList, 'ReferencePoints'>

function openMapsToPoint(lat: number, lng: number, label?: string) {
  const encodedLabel = encodeURIComponent(label ?? 'Reference Point')
  const url = Platform.select({
    ios: `maps://app?daddr=${lat},${lng}&dirflg=w`,
    android: `google.navigation:q=${lat},${lng}&mode=w`,
  })
  if (url) Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`)
  })
}

export function ReferencePointNavigator() {
  const navigation = useNavigation<Nav>()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const insets     = useSafeAreaInsets()
  const qc         = useQueryClient()
  const { elapsedSecs } = useActiveTaskStore()

  const { capture: captureEnvDNA } = useEnvironmentalDNA()
  const [workerLoc, setWorkerLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [cameraState, setCameraState] = useState<{
    visible: boolean
    pointId: string | null
    pointIndex: number
    label: string | null
    buyerImageUrl: string | null
    isVerification: boolean
    distance: number | null
    targetLat: number | null
    targetLng: number | null
  }>({ visible: false, pointId: null, pointIndex: 0, label: null, buyerImageUrl: null, isVerification: false, distance: null, targetLat: null, targetLng: null })

  // Silent layers: capture EnvDNA (motion tracking already started in ActiveTaskScreen)
  useEffect(() => {
    // Fire-and-forget: capture environmental DNA on screen mount
    captureEnvDNA().then((envDNA) => {
      apiClient.post(`/tasks/${taskId}/environment`, {
        captureType: 'WORKER_START',
        ...envDNA,
      }).catch(() => {}) // non-blocking
    }).catch(() => {})
  }, [taskId])

  // Poll GPS
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((loc) => setWorkerLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      .catch(() => {})
    interval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setWorkerLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch { /* ignore */ }
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  // Fetch progress (with GPS for verification reveal)
  // GPS removed from queryKey to prevent refetch on every GPS update (every 10s).
  // The 15s refetchInterval ensures fresh data; GPS is passed as a param only.
  const { data: progress, isLoading } = useQuery<SubmissionProgress>({
    queryKey: ['submission-progress', taskId],
    queryFn:  () => referencePointsApi.progress(taskId, workerLoc?.lat, workerLoc?.lng),
    refetchInterval: 20_000,
  })

  // Refs to avoid stale closure in onCapture callback
  const activePointRef = useRef<{ pointId: string; isVerification: boolean }>({ pointId: '', isVerification: false })
  const navigateBtnPressed = useRef(false)

  const openCamera = useCallback((point: SubmissionProgress['points'][number]) => {
    activePointRef.current = { pointId: point.id, isVerification: point.isVerificationPoint }
    setCameraState({
      visible: true,
      pointId: point.id,
      pointIndex: point.pointIndex,
      label: point.label,
      buyerImageUrl: point.buyerImageUrl,
      isVerification: point.isVerificationPoint,
      distance: point.distanceFromWorker,
      targetLat: point.buyerLat ?? null,
      targetLng: point.buyerLng ?? null,
    })
  }, [])

  const onCapture = useCallback(async (result: CaptureResult) => {
    // Close camera IMMEDIATELY — don't block on upload (was causing 10s freeze)
    setCameraState(s => ({ ...s, visible: false }))
    const { pointId, isVerification } = activePointRef.current
    if (!pointId) return

    const meta = result.photo.metadata ? {
      lat:       result.photo.metadata.lat,
      lng:       result.photo.metadata.lng,
      timestamp: result.photo.metadata.timestamp,
      deviceId:  result.photo.metadata.deviceId,
      photoHash: result.photo.metadata.photoHash,
    } : undefined

    // Upload in background — user returns to reference points list instantly
    referencePointsApi.submitPoint(
      taskId, pointId, 'AFTER', result.photo.fullUri, meta,
    )
      .then(() => {
        qc.invalidateQueries({ queryKey: ['submission-progress', taskId] })
      })
      .catch(() => {
        Alert.alert('Upload Failed', 'Photo upload failed. Check your connection and try again.')
      })
  }, [taskId, qc])

  if (isLoading || !progress) {
    return <View style={s.center}><ActivityIndicator color={W.primary} size="large" /></View>
  }

  const progressPct = progress.totalPoints > 0
    ? Math.round((progress.afterCompleted / progress.totalPoints) * 100)
    : 0

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={W.text.primary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Reference Points</Text>
          <Text style={s.headerTimer}>{formatElapsed(elapsedSecs)}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Progress bar */}
        <View style={s.progressSection}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>
              {progress.afterCompleted}/{progress.totalPoints} after
            </Text>
            <Text style={s.progressLabel}>
              {progress.verificationCompleted}/{progress.verificationRequired} verified
            </Text>
          </View>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>

        {/* Points list */}
        {progress.points.map((point) => {
          const isDone = point.hasAfterSubmission || point.hasVerificationSubmission
          const isVerify = point.isVerificationPoint

          return (
            <TouchableOpacity
              key={point.id}
              style={[s.pointCard, isDone && s.pointCardDone]}
              onPress={() => {
                // Don't open camera if the navigate button was tapped (handled by navigateBtnPressed ref)
                if (navigateBtnPressed.current) { navigateBtnPressed.current = false; return }
                // Allow retaking even if done — worker may want a better photo
                openCamera(point)
              }}
              activeOpacity={0.85}
            >
              <View style={s.pointLeft}>
                {isDone ? (
                  <CheckCircle size={22} color={W.status.success} />
                ) : isVerify ? (
                  <Lock size={22} color="#7C3AED" />
                ) : (
                  <View style={s.pointNum}>
                    <Text style={s.pointNumText}>{point.pointIndex}</Text>
                  </View>
                )}
              </View>

              <View style={s.pointCenter}>
                <Text style={s.pointTitle}>
                  {point.label ?? `Point ${point.pointIndex}`}
                </Text>
                <View style={s.pointMeta}>
                  {isVerify && <Text style={s.verifyBadge}>VERIFY</Text>}
                  {isDone && point.afterSubmission?.locationMatchScore != null && (
                    <Text style={[s.scoreText, {
                      color: point.afterSubmission.locationMatchScore >= 75 ? W.status.success
                        : point.afterSubmission.locationMatchScore >= 50 ? '#D97706' : W.status.error,
                    }]}>
                      GPS: {point.afterSubmission.locationMatchScore}/100
                    </Text>
                  )}
                  {!isDone && point.distanceFromWorker != null && (
                    <View style={s.distanceRow}>
                      <MapPin size={12} color={W.text.muted} />
                      <Text style={s.distanceText}>{point.distanceFromWorker}m</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={s.pointRight}>
                {isDone ? (
                  <CachedImage source={{ uri: point.afterSubmission?.imageUrl ?? point.buyerImageUrl }} style={s.pointThumb} />
                ) : (
                  <View style={s.pointActions}>
                    <CachedImage source={{ uri: point.buyerImageUrl }} style={[s.pointThumb, s.pointThumbRef]} />
                    {point.buyerLat != null && point.buyerLng != null && (
                      <TouchableOpacity
                        style={s.navigateBtn}
                        onPress={() => {
                          navigateBtnPressed.current = true
                          openMapsToPoint(point.buyerLat!, point.buyerLng!, point.label ?? `Point ${point.pointIndex}`)
                        }}
                        activeOpacity={0.7}
                      >
                        <Navigation2 size={12} color={W.primary} />
                        <Text style={s.navigateBtnText}>Go</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        {progress.canSubmit ? (
          <TouchableOpacity
            style={s.submitBtn}
            onPress={async () => {
              // Send motion summary + final EnvDNA before navigating (fire-and-forget)
              try {
                const motionSummary = stopMotionTracking()
                await apiClient.post(`/tasks/${taskId}/motion-summary`, motionSummary).catch(() => {})
                const finalEnvDNA = await captureEnvDNA()
                await apiClient.post(`/tasks/${taskId}/environment`, {
                  captureType: 'WORKER_SUBMIT', ...finalEnvDNA,
                }).catch(() => {})
              } catch { /* non-blocking */ }
              navigation.navigate('SubmitProof', { taskId })
            }}
            activeOpacity={0.85}
          >
            <Text style={s.submitBtnText}>Review & Submit</Text>
          </TouchableOpacity>
        ) : (
          <View style={[s.submitBtn, s.submitBtnDisabled]}>
            <Text style={s.submitBtnTextDisabled}>
              {progress.verificationCompleted < progress.verificationRequired
                ? `Need ${progress.verificationRequired - progress.verificationCompleted} more verification photo(s)`
                : `Need ${Math.max(3, Math.ceil(progress.totalPoints * 0.7)) - progress.afterCompleted} more after photo(s)`
              }
            </Text>
          </View>
        )}
      </View>

      {/* Camera modal */}
      <Modal visible={cameraState.visible} animationType="slide" statusBarTranslucent>
        <CaptureCamera
          taskId={taskId}
          photoType={cameraState.isVerification ? 'VERIFICATION' : 'AFTER'}
          onCapture={onCapture}
          onClose={() => setCameraState(s => ({ ...s, visible: false }))}
          referenceImage={cameraState.buyerImageUrl}
          referenceLabel={cameraState.label}
          pointIndex={cameraState.pointIndex}
          totalPoints={progress.totalPoints}
          distanceFromPoint={cameraState.distance}
          targetLat={cameraState.targetLat}
          targetLng={cameraState.targetLng}
        />
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: W.background },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:  { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 16, backgroundColor: W.surface, borderBottomWidth: 1, borderBottomColor: W.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: W.text.primary },
  headerTimer:  { fontSize: 12, color: W.text.muted, fontWeight: '600' },

  content: { padding: 16, gap: 10 },

  // Progress
  progressSection: { marginBottom: 8 },
  progressRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel:   { fontSize: 12, fontWeight: '600', color: W.text.secondary },
  progressBar:     { height: 6, borderRadius: 3, backgroundColor: W.border },
  progressFill:    { height: '100%', borderRadius: 3, backgroundColor: W.primary },

  // Point card
  pointCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: W.surface, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: W.border },
  pointCardDone:  { borderColor: W.status.success + '40', backgroundColor: W.status.success + '08' },
  pointLeft:      { width: 28, alignItems: 'center' },
  pointNum:       { width: 24, height: 24, borderRadius: 12, backgroundColor: W.primaryTint, alignItems: 'center', justifyContent: 'center' },
  pointNumText:   { fontSize: 12, fontWeight: '700', color: W.primary },
  pointCenter:    { flex: 1 },
  pointTitle:     { fontSize: 14, fontWeight: '600', color: W.text.primary },
  pointMeta:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  verifyBadge:    { fontSize: 10, fontWeight: '700', color: '#7C3AED', backgroundColor: '#7C3AED18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  scoreText:      { fontSize: 11, fontWeight: '700' },
  distanceRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  distanceText:   { fontSize: 11, color: W.text.muted, fontWeight: '500' },
  pointRight:     { width: 52, alignItems: 'center' },
  pointActions:   { alignItems: 'center', gap: 4 },
  pointThumb:     { width: 52, height: 52, borderRadius: 10 },
  pointThumbRef:  { opacity: 0.6 },
  navigateBtn:    { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: W.primaryTint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  navigateBtnText:{ fontSize: 10, fontWeight: '700', color: W.primary },

  // Footer
  footer:             { padding: 16, paddingBottom: 32, backgroundColor: W.surface, borderTopWidth: 1, borderTopColor: W.border },
  submitBtn:          { backgroundColor: W.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  submitBtnText:      { fontSize: 16, fontWeight: '700', color: '#fff' },
  submitBtnDisabled:  { backgroundColor: W.border },
  submitBtnTextDisabled: { fontSize: 13, fontWeight: '600', color: W.text.muted, textAlign: 'center' },
})
