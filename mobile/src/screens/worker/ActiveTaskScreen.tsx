// ActiveTaskScreen — THE most complex screen in the app.
// Handles both ACCEPTED (pre-start) and IN_PROGRESS (active) task states.
// GPS via socket.emit('worker:gps') — NOT HTTP.
// Timer computed from task.startedAt (server time) — NOT useState(0).
// Background GPS via expo-task-manager — works with phone locked.

import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Image, ActivityIndicator, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import MapView, { Marker, Polyline, Circle } from 'react-native-maps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { Camera, CheckCircle, Wifi, WifiOff, Play, X, Images, MapPin, Clock, AlertTriangle, MessageCircle } from 'lucide-react-native'
import { Modal } from 'react-native'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import type { CaptureResult } from '../../components/camera/CaptureCamera'
import type { PhotoType } from '../../components/camera/CaptureCamera'

import { FlatList, Dimensions } from 'react-native'
import { COLORS } from '../../constants/colors'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { getAllPhotos, GalleryPhoto } from '../../services/galleryService'
import { workerTasksApi } from '../../api/tasks.api'
import { mediaApi } from '../../api/media.api'
import { useBackgroundLocation } from '../../hooks/useBackgroundLocation'
import { useActiveTaskStore } from '../../stores/activeTaskStore'
import { useSocketStore } from '../../stores/socketStore'
import { formatMoney } from '../../utils/formatMoney'
import type { WorkerStackParamList } from '../../navigation/types'
import type { MediaType } from '../../types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList, 'ActiveTask'>
type Route = RouteProp<WorkerStackParamList, 'ActiveTask'>

interface PhotoState {
  uri:       string | null
  uploading: boolean
  uploaded:  boolean
}

const PHOTO_TYPES: { type: MediaType; label: string }[] = [
  { type: 'BEFORE', label: 'Before' },
  { type: 'AFTER',  label: 'After'  },
  { type: 'PROOF',  label: 'Proof'  },
]

function formatElapsed(secs: number): string {
  const h   = Math.floor(secs / 3600)
  const m   = Math.floor((secs % 3600) / 60)
  const s   = secs % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function ActiveTaskScreen() {
  const navigation          = useNavigation<Nav>()
  const route               = useRoute<Route>()
  const { taskId }          = route.params
  const queryClient         = useQueryClient()
  const { joinTask, leaveTask, connected } = useSocketStore()

  const { setActiveTask, gpsTrail, elapsedSecs, setElapsedSecs } = useActiveTaskStore()
  const { currentLocation, requestPermissions, startTracking, stopTracking } = useBackgroundLocation()

  const mapRef        = useRef<MapView>(null)
  const isCancelling  = useRef(false)
  const isStarting    = useRef(false)

  const [photos, setPhotos] = useState<Record<MediaType, PhotoState>>({
    BEFORE:    { uri: null, uploading: false, uploaded: false },
    AFTER:     { uri: null, uploading: false, uploaded: false },
    PROOF:     { uri: null, uploading: false, uploaded: false },
    REFERENCE: { uri: null, uploading: false, uploaded: false },
  })
  const [cameraType, setCameraType] = useState<PhotoType | null>(null)
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [photoSourceType, setPhotoSourceType] = useState<MediaType | null>(null)
  const [galleryPicker, setGalleryPicker] = useState<MediaType | null>(null)
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([])
  const [gpsWarning, setGpsWarning] = useState(false)

  // ── Task query ────────────────────────────────────────────────────────────
  const { data: task, isLoading } = useQuery({
    queryKey: ['worker', 'task', taskId],
    queryFn:  () => workerTasksApi.getTask(taskId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  // ── Join socket room on mount ─────────────────────────────────────────────
  useEffect(() => {
    joinTask(taskId)
    return () => leaveTask(taskId)
  }, [taskId, joinTask, leaveTask])

  // ── Sync active task store ────────────────────────────────────────────────
  useEffect(() => {
    if (task) setActiveTask(task)
  }, [task, setActiveTask])

  // ── Timer: computed from server startedAt (survives restart) ─────────────
  useEffect(() => {
    if (!task?.startedAt) return
    const startMs = new Date(task.startedAt).getTime()
    const tick = () => setElapsedSecs(Math.floor((Date.now() - startMs) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [task?.startedAt, setElapsedSecs])

  // ── Restart background tracking if IN_PROGRESS on mount ──────────────────
  useEffect(() => {
    if (task?.status === 'IN_PROGRESS') {
      startTracking(taskId)
    }
  }, [task?.status]) // intentionally only on status change

  // ── Move map camera to worker location ───────────────────────────────────
  useEffect(() => {
    if (currentLocation) {
      mapRef.current?.animateToRegion({
        latitude:       currentLocation.lat,
        longitude:      currentLocation.lng,
        latitudeDelta:  0.005,
        longitudeDelta: 0.005,
      }, 800)
    }
  }, [currentLocation])

  // ── Start Task mutation (ACCEPTED → IN_PROGRESS) ──────────────────────────
  const startMutation = useMutation({
    mutationFn: () =>
      workerTasksApi.start(taskId, currentLocation
        ? { lat: currentLocation.lat, lng: currentLocation.lng }
        : undefined,
      ),
    onSuccess: async () => {
      isStarting.current = false
      queryClient.invalidateQueries({ queryKey: ['worker', 'task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      const granted = await requestPermissions()
      if (granted) await startTracking(taskId)
    },
    onError: (err: any) => {
      isStarting.current = false
      const msg = err?.response?.data?.error?.message ?? 'Could not start task'
      Alert.alert('Cannot Start', msg)
    },
  })

  // ── Cancel Task mutation ──────────────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => workerTasksApi.cancel(taskId, reason),
    onSuccess: async () => {
      await stopTracking()
      setActiveTask(null)
      queryClient.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as never)
    },
    onError: (err: any) => {
      isCancelling.current = false
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not cancel task')
    },
  })

  const handleStart = () => {
    if (isStarting.current) return
    if (!currentLocation) {
      setGpsWarning(true)
      return
    }
    setGpsWarning(false)
    isStarting.current = true
    startMutation.mutate()
  }

  const handleCancel = () => {
    setCancelReason('')
    setCancelModal(true)
  }

  const confirmCancel = () => {
    if (isCancelling.current) return
    if (cancelReason.trim().length < 5) {
      Alert.alert('Reason Required', 'Please provide at least 5 characters.')
      return
    }
    isCancelling.current = true
    setCancelModal(false)
    cancelMutation.mutate(cancelReason.trim())
  }

  const openPhotoChoice = useCallback((type: MediaType) => {
    setPhotoSourceType(type)
  }, [])

  const pickFromCamera = useCallback(() => {
    if (!photoSourceType) return
    setPhotoSourceType(null)
    setCameraType(photoSourceType as PhotoType)
  }, [photoSourceType])

  const pickFromGallery = useCallback(async () => {
    if (!photoSourceType) return
    const all = await getAllPhotos()
    setGalleryPhotos(all)
    setPhotoSourceType(null)
    setGalleryPicker(photoSourceType)
  }, [photoSourceType])

  const handleCapture = useCallback((result: CaptureResult) => {
    if (!cameraType) return
    setCameraType(null)
    uploadPhoto(cameraType as MediaType, result.photo.fullUri)
  }, [cameraType, taskId])

  const handleGalleryPick = useCallback((photo: GalleryPhoto) => {
    if (!galleryPicker) return
    setGalleryPicker(null)
    uploadPhoto(galleryPicker, photo.fullUri)
  }, [galleryPicker, taskId])

  const uploadPhoto = useCallback(async (type: MediaType, uri: string) => {
    setPhotos((p) => ({ ...p, [type]: { uri, uploading: true, uploaded: false } }))
    try {
      await mediaApi.upload(taskId, uri, type)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPhotos((p) => ({ ...p, [type]: { uri, uploading: false, uploaded: true } }))
    } catch {
      setPhotos((p) => ({ ...p, [type]: { uri: null, uploading: false, uploaded: false } }))
      Alert.alert('Upload Failed', 'Please check your connection and try again.')
    }
  }, [taskId])

  const allUploaded = PHOTO_TYPES.every(({ type }) => photos[type].uploaded)
  const isInProgress = task?.status === 'IN_PROGRESS'
  const isAccepted   = task?.status === 'ACCEPTED'

  if (isLoading || !task) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={W.primary} size="large" />
      </View>
    )
  }

  const mapRegion = currentLocation
    ? { latitude: currentLocation.lat, longitude: currentLocation.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }
    : task.locationLat
      ? { latitude: task.locationLat, longitude: task.locationLng!, latitudeDelta: 0.008, longitudeDelta: 0.008 }
      : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05 }

  return (
    <View style={styles.container}>
      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          showsUserLocation={false}
        >
          {/* Task location pin */}
          {task.locationLat && (
            <Marker
              coordinate={{ latitude: task.locationLat, longitude: task.locationLng! }}
              pinColor={COLORS.map.task}
              title="Task Location"
            />
          )}

          {/* 2km geofence circle */}
          {task.locationLat && (
            <Circle
              center={{ latitude: task.locationLat, longitude: task.locationLng! }}
              radius={2000}
              strokeColor={`${W.primary}60`}
              fillColor={`${W.primary}10`}
            />
          )}

          {/* Worker current position */}
          {currentLocation && (
            <Marker
              coordinate={{ latitude: currentLocation.lat, longitude: currentLocation.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.workerDot}>
                <View style={styles.workerDotInner} />
              </View>
            </Marker>
          )}

          {/* GPS trail polyline */}
          {gpsTrail.length > 1 && (
            <Polyline
              coordinates={gpsTrail.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
              strokeColor={COLORS.map.trail}
              strokeWidth={3}
            />
          )}
        </MapView>

        {/* Status bar overlay */}
        <View style={styles.statusBar}>
          <View style={styles.timerBox}>
            <Text style={styles.timerText}>{formatElapsed(elapsedSecs)}</Text>
            <Text style={styles.timerLabel}>elapsed</Text>
          </View>
          <View style={styles.gpsStatus}>
            {connected
              ? <Wifi size={14} color={W.status.success} />
              : <WifiOff size={14} color={W.status.error} />}
            <Text style={[styles.gpsText, { color: connected ? W.status.success : W.status.error }]}>
              {connected ? 'GPS live' : 'No signal'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Bottom Panel ── */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {/* Task info row */}
        <View style={styles.taskInfoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
            <Text style={styles.taskCategory}>{task.category ?? 'General'}</Text>
          </View>
          <View style={styles.rateChip}>
            <Text style={styles.rateText}>{formatMoney(task.rateCents, 'INR')}</Text>
          </View>
        </View>

        {/* Start Work button (ACCEPTED state) */}
        {isAccepted && (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardText}>Go to the task location and tap Start Work when you arrive.</Text>
            </View>
            {gpsWarning && (
              <View style={styles.gpsWarning}>
                <AlertTriangle size={14} color={W.status.warning} />
                <Text style={styles.gpsWarningText}>Waiting for GPS signal — please try again shortly.</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.startBtn, startMutation.isPending && styles.btnDisabled]}
              onPress={handleStart}
              activeOpacity={0.85}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : (
                    <>
                      <Play size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.startBtnText}>Start Work</Text>
                    </>
                  )}
            </TouchableOpacity>
          </>
        )}

        {/* Photo Evidence (IN_PROGRESS only) */}
        {isInProgress && (
          <>
            {/* Progress indicator */}
            <View style={styles.progressRow}>
              <Text style={styles.sectionLabel}>Evidence Photos</Text>
              <View style={styles.progressPills}>
                {PHOTO_TYPES.map(({ type }) => (
                  <View key={type} style={[styles.pill, photos[type].uploaded && styles.pillDone]} />
                ))}
              </View>
              <Text style={styles.progressText}>
                {PHOTO_TYPES.filter(({ type }) => photos[type].uploaded).length}/3
              </Text>
            </View>

            {/* Photo grid — taller boxes with labels inside */}
            <View style={styles.photoGrid}>
              {PHOTO_TYPES.map(({ type, label }) => (
                <PhotoBox
                  key={type}
                  label={label}
                  state={photos[type]}
                  onPress={() => openPhotoChoice(type)}
                />
              ))}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, !allUploaded && styles.btnDisabled]}
              onPress={() => navigation.navigate('SubmitProof', { taskId })}
              disabled={!allUploaded}
              activeOpacity={0.85}
            >
              <CheckCircle size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                {allUploaded ? 'Review & Submit' : 'Complete all 3 photos to submit'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Task info */}
        {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}
        {task.locationAddress ? (
          <Text style={styles.infoLine}>{task.locationAddress}</Text>
        ) : null}

        {/* Chat */}
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => navigation.navigate('Chat', { taskId, title: task.title })}
          activeOpacity={0.85}
        >
          <MessageCircle size={16} color={W.primary} />
          <Text style={styles.chatBtnText}>Message Buyer</Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancel}
          disabled={cancelMutation.isPending}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelBtnText}>Cancel Task</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Photo source picker */}
      <Modal visible={!!photoSourceType} transparent animationType="fade" onRequestClose={() => setPhotoSourceType(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPhotoSourceType(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sourceSheet}>
            <View style={styles.sourceHandle} />
            <View style={styles.sourceHeaderRow}>
              <View style={[styles.sourceBadge, { backgroundColor: LABEL_COLORS[photoSourceType === 'BEFORE' ? 'Before' : photoSourceType === 'AFTER' ? 'After' : 'Proof'] ?? W.primary }]}>
                <Text style={styles.sourceBadgeText}>{photoSourceType}</Text>
              </View>
              <Text style={styles.sourceTitle}>Add Evidence</Text>
            </View>

            <View style={styles.sourceCards}>
              <TouchableOpacity style={styles.sourceCard} onPress={pickFromCamera} activeOpacity={0.85}>
                <View style={[styles.sourceCardIcon, { backgroundColor: `${W.primary}15` }]}>
                  <Camera size={28} color={W.primary} />
                </View>
                <Text style={styles.sourceCardTitle}>Take Photo</Text>
                <Text style={styles.sourceCardSub}>Capture fresh{'\n'}evidence now</Text>
                <View style={[styles.sourceCardTag, { backgroundColor: W.primary }]}>
                  <Text style={styles.sourceCardTagText}>Recommended</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sourceCard} onPress={pickFromGallery} activeOpacity={0.85}>
                <View style={[styles.sourceCardIcon, { backgroundColor: '#8B5CF615' }]}>
                  <Images size={28} color="#8B5CF6" />
                </View>
                <Text style={styles.sourceCardTitle}>My Photos</Text>
                <Text style={styles.sourceCardSub}>Choose from{'\n'}your gallery</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sourceFooter}>All photos are securely verified</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Cancel reason modal */}
      <Modal visible={cancelModal} transparent animationType="fade" onRequestClose={() => setCancelModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCancelModal(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.cancelSheet}>
              <Text style={styles.cancelSheetTitle}>Cancel Task</Text>
              <Text style={styles.cancelSheetSub}>Tell us why you're cancelling (min 5 chars)</Text>
              <TextInput
                style={styles.cancelInput}
                placeholder="e.g. Area is inaccessible, weather issue..."
                placeholderTextColor={W.text.muted}
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                maxLength={200}
                autoFocus
              />
              <Text style={styles.cancelCharCount}>{cancelReason.length}/200</Text>
              <View style={styles.cancelBtns}>
                <TouchableOpacity style={styles.cancelSheetBack} onPress={() => setCancelModal(false)}>
                  <Text style={styles.cancelSheetBackText}>Go Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelSheetConfirm, cancelReason.trim().length < 5 && styles.btnDisabled]}
                  onPress={confirmCancel}
                  disabled={cancelReason.trim().length < 5}
                >
                  <Text style={styles.cancelSheetConfirmText}>Cancel Task</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Internal gallery picker modal */}
      <Modal visible={!!galleryPicker} animationType="slide" onRequestClose={() => setGalleryPicker(null)}>
        <View style={styles.gpModal}>
          <View style={styles.gpHeader}>
            <TouchableOpacity onPress={() => setGalleryPicker(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color={W.text.primary} />
            </TouchableOpacity>
            <Text style={styles.gpTitle}>Select from My Photos</Text>
            <View style={{ width: 22 }} />
          </View>
          {galleryPhotos.length === 0 ? (
            <View style={styles.gpEmpty}>
              <Text style={styles.gpEmptyText}>No photos yet. Take one first!</Text>
            </View>
          ) : (
            <FlatList
              data={galleryPhotos}
              numColumns={3}
              keyExtractor={p => p.id}
              contentContainerStyle={{ padding: 2 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.gpThumb}
                  onPress={() => handleGalleryPick(item)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: item.thumbUri }} style={styles.gpThumbImg} resizeMode="cover" />
                  <View style={[styles.gpTypeDot, { backgroundColor: LABEL_COLORS[item.photoType === 'BEFORE' ? 'Before' : item.photoType === 'AFTER' ? 'After' : 'Proof'] ?? W.text.muted }]}>
                    <Text style={styles.gpTypeDotText}>{item.photoType[0]}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* CaptureCamera modal — camera only, NO gallery */}
      <Modal visible={!!cameraType} animationType="slide" statusBarTranslucent>
        {cameraType && (
          <CaptureCamera
            taskId={taskId}
            photoType={cameraType}
            onCapture={handleCapture}
            onClose={() => setCameraType(null)}
          />
        )}
      </Modal>
    </View>
  )
}

const LABEL_COLORS: Record<string, string> = {
  Before: '#F59E0B',
  After:  '#2E8B57',
  Proof:  '#3B82F6',
}

function PhotoBox({ label, state, onPress }: { label: string; state: PhotoState; onPress: () => void }) {
  const color = LABEL_COLORS[label] ?? W.text.muted
  return (
    <TouchableOpacity style={styles.photoBox} onPress={onPress} activeOpacity={0.8}>
      {state.uploading ? (
        <View style={styles.photoBoxInner}>
          <ActivityIndicator color={color} />
          <Text style={[styles.photoLabel, { color }]}>Uploading...</Text>
        </View>
      ) : state.uri && state.uploaded ? (
        <>
          <Image source={{ uri: state.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[styles.checkOverlay, { backgroundColor: color }]}>
            <CheckCircle size={16} color="#fff" />
          </View>
          <View style={[styles.photoBadge, { backgroundColor: color }]}>
            <Text style={styles.photoBadgeText}>{label}</Text>
          </View>
        </>
      ) : state.uri ? (
        <>
          <Image source={{ uri: state.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[styles.photoBadge, { backgroundColor: color }]}>
            <Text style={styles.photoBadgeText}>{label}</Text>
          </View>
        </>
      ) : (
        <View style={styles.photoBoxInner}>
          <View style={[styles.photoIconCircle, { borderColor: color }]}>
            <Camera size={20} color={color} />
          </View>
          <Text style={[styles.photoLabel, { color }]}>{label}</Text>
          <Text style={styles.photoHint}>Tap to capture</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: W.background },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapContainer:   { height: 200 },
  statusBar:      { position: 'absolute', top: 52, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerBox:       { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  timerText:      { fontSize: 20, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  timerLabel:     { fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  gpsStatus:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  gpsText:        { fontSize: 11, fontWeight: '600' },
  workerDot:      { width: 20, height: 20, borderRadius: 10, backgroundColor: `${COLORS.map.worker}40`, alignItems: 'center', justifyContent: 'center' },
  workerDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.map.worker },

  // Panel
  panel:          { flex: 1 },
  panelContent:   { backgroundColor: W.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, borderTopLeftRadius: 20, borderTopRightRadius: 20 },

  // Task info
  taskInfoRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  taskTitle:      { fontSize: 16, fontWeight: '700', color: W.text.primary },
  taskCategory:   { fontSize: 12, color: W.text.secondary, marginTop: 2 },
  rateChip:       { backgroundColor: W.primaryTint, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: W.primary },
  rateText:       { fontSize: 16, fontWeight: '800', color: W.primary },

  // Info card (ACCEPTED state)
  infoCard:       { backgroundColor: W.primaryTint, borderRadius: 10, padding: 12, marginBottom: 12 },
  infoCardText:   { fontSize: 13, color: W.text.secondary, lineHeight: 18 },

  // GPS warning (inline, subtle)
  gpsWarning:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  gpsWarningText: { fontSize: 12, color: '#92400E', flex: 1 },

  // Progress row
  progressRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionLabel:   { fontSize: 14, fontWeight: '700', color: W.text.primary },
  progressPills:  { flexDirection: 'row', gap: 4, marginLeft: 'auto', marginRight: 8 },
  pill:           { width: 20, height: 4, borderRadius: 2, backgroundColor: W.border },
  pillDone:       { backgroundColor: W.primary },
  progressText:   { fontSize: 12, fontWeight: '700', color: W.text.secondary },

  // Photo grid
  photoGrid:      { flexDirection: 'row', gap: 8, marginBottom: 12 },
  photoBox:       { flex: 1, aspectRatio: 0.85, borderRadius: 12, backgroundColor: W.background, borderWidth: 1.5, borderColor: W.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoBoxInner:  { alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoIconCircle:{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  photoLabel:     { fontSize: 12, fontWeight: '700' },
  photoHint:      { fontSize: 9, color: W.text.muted },
  photoBadge:     { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  photoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  checkOverlay:   { position: 'absolute', bottom: 6, right: 6, borderRadius: 10, padding: 3 },

  // Buttons
  startBtn:       { backgroundColor: W.primary, borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  submitBtn:      { backgroundColor: W.primary, borderRadius: 14, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  submitBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
  desc:           { fontSize: 13, color: W.text.secondary, lineHeight: 19, marginBottom: 8 },
  infoLine:       { fontSize: 12, color: W.text.secondary, marginBottom: 12 },
  chatBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: W.primaryTint, marginBottom: 8 },
  chatBtnText:    { fontSize: 14, fontWeight: '600', color: W.primary },
  cancelBtn:      { height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: W.border, marginTop: 4 },
  cancelBtnText:  { fontSize: 13, fontWeight: '500', color: W.text.secondary },
  btnDisabled:    { opacity: 0.45 },

  // Cancel modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  cancelSheet:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  cancelSheetTitle: { fontSize: 20, fontWeight: '800', color: W.text.primary, marginBottom: 4 },
  cancelSheetSub: { fontSize: 13, color: W.text.secondary, marginBottom: 16 },
  cancelInput:    { backgroundColor: W.primaryTint, borderRadius: 12, padding: 14, fontSize: 15, color: W.text.primary, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: W.border },
  cancelCharCount:{ fontSize: 11, color: W.text.muted, textAlign: 'right', marginTop: 4 },
  cancelBtns:     { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelSheetBack:{ flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: W.border },
  cancelSheetBackText: { fontSize: 15, fontWeight: '600', color: W.text.secondary },
  cancelSheetConfirm: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: W.status.error },
  cancelSheetConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Source picker sheet
  sourceSheet:      { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 36 },
  sourceHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.neutral[300], alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  sourceHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  sourceBadge:      { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  sourceBadgeText:  { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sourceTitle:      { fontSize: 20, fontWeight: '800', color: W.text.primary },
  sourceCards:      { flexDirection: 'row', gap: 12 },
  sourceCard:       { flex: 1, backgroundColor: W.background, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: W.border },
  sourceCardIcon:   { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  sourceCardTitle:  { fontSize: 15, fontWeight: '700', color: W.text.primary, marginBottom: 4 },
  sourceCardSub:    { fontSize: 11, color: W.text.secondary, textAlign: 'center', lineHeight: 16 },
  sourceCardTag:    { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceCardTagText:{ color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  sourceFooter:     { fontSize: 10, color: W.text.muted, textAlign: 'center', marginTop: 16 },

  // Gallery picker
  gpModal:        { flex: 1, backgroundColor: '#fff' },
  gpHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: W.border },
  gpTitle:        { fontSize: 17, fontWeight: '700', color: W.text.primary },
  gpEmpty:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gpEmptyText:    { fontSize: 14, color: W.text.muted },
  gpThumb:        { width: (Dimensions.get('window').width - 6) / 3, height: (Dimensions.get('window').width - 6) / 3, margin: 1 },
  gpThumbImg:     { width: '100%', height: '100%' },
  gpTypeDot:      { position: 'absolute', top: 4, left: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gpTypeDotText:  { color: '#fff', fontSize: 9, fontWeight: '800' },
})
