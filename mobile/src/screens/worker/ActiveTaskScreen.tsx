// ActiveTaskScreen — THE most complex screen in the app.
// Handles both ACCEPTED (pre-start) and IN_PROGRESS (active) task states.
// GPS via socket.emit('worker:gps') — NOT HTTP.
// Timer computed from task.startedAt (server time) — NOT useState(0).
// Background GPS via expo-task-manager — works with phone locked.

import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Image, ActivityIndicator, ScrollView,
} from 'react-native'
import MapView, { Marker, Polyline, Circle } from 'react-native-maps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Camera, CheckCircle, Wifi, WifiOff, Play, X } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
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
      Alert.alert('GPS Required', 'Please wait for your GPS to acquire a signal before starting.')
      return
    }
    isStarting.current = true
    startMutation.mutate()
  }

  const handleCancel = () => {
    if (isCancelling.current) return
    Alert.prompt(
      'Cancel Task',
      'Please provide a reason for cancellation:',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Task',
          style: 'destructive',
          onPress: (reason) => {
            if (!reason || reason.trim().length < 5) {
              Alert.alert('Reason Required', 'Please provide at least 5 characters.')
              return
            }
            isCancelling.current = true
            cancelMutation.mutate(reason.trim())
          },
        },
      ],
      'plain-text',
    )
  }

  const pickAndUpload = useCallback((type: MediaType) => {
    Alert.alert('Upload Photo', `Select ${type.toLowerCase()} photo`, [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync()
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Camera access is required.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.8,
          })
          if (!result.canceled) uploadPhoto(type, result.assets[0].uri)
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality:    0.8,
          })
          if (!result.canceled) uploadPhoto(type, result.assets[0].uri)
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [taskId])

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
        <ActivityIndicator color={COLORS.brand.primary} size="large" />
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
              strokeColor={`${COLORS.brand.primary}60`}
              fillColor={`${COLORS.brand.primary}10`}
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
              ? <Wifi size={14} color={COLORS.status.success} />
              : <WifiOff size={14} color={COLORS.status.error} />}
            <Text style={[styles.gpsText, { color: connected ? COLORS.status.success : COLORS.status.error }]}>
              {connected ? 'GPS live' : 'No signal'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Bottom Panel ── */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={styles.taskRate}>{formatMoney(task.rateCents, 'INR')}</Text>

        {/* Start Work button (ACCEPTED state) */}
        {isAccepted && (
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
        )}

        {/* Photo Grid (IN_PROGRESS only) */}
        {isInProgress && (
          <>
            <Text style={styles.sectionLabel}>Upload Photos</Text>
            <View style={styles.photoGrid}>
              {PHOTO_TYPES.map(({ type, label }) => (
                <PhotoBox
                  key={type}
                  label={label}
                  state={photos[type]}
                  onPress={() => pickAndUpload(type)}
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
                {allUploaded ? 'Review & Submit' : `Photos: ${PHOTO_TYPES.filter(({ type }) => photos[type].uploaded).length}/3`}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancel}
          disabled={cancelMutation.isPending}
          activeOpacity={0.85}
        >
          <X size={16} color={COLORS.status.error} style={{ marginRight: 6 }} />
          <Text style={styles.cancelBtnText}>Cancel Task</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function PhotoBox({ label, state, onPress }: { label: string; state: PhotoState; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.photoBox} onPress={onPress} activeOpacity={0.8}>
      {state.uploading ? (
        <ActivityIndicator color={COLORS.brand.primary} />
      ) : state.uri && state.uploaded ? (
        <>
          <Image source={{ uri: state.uri }} style={StyleSheet.absoluteFill} />
          <View style={styles.checkOverlay}>
            <CheckCircle size={24} color="#fff" />
          </View>
        </>
      ) : (
        <>
          <Camera size={28} color={COLORS.neutral[400]} />
          <Text style={styles.photoLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.background },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapContainer:   { flex: 1 },
  statusBar:      {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerBox:       {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  timerText:      { fontSize: 22, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  timerLabel:     { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  gpsStatus:      {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gpsText:        { fontSize: 12, fontWeight: '600' },
  workerDot:      {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: `${COLORS.map.worker}40`,
    alignItems: 'center', justifyContent: 'center',
  },
  workerDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.map.worker },
  panel:          { maxHeight: 340 },
  panelContent:   {
    backgroundColor: COLORS.surface,
    padding: 20,
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  taskTitle:      { fontSize: 17, fontWeight: '700', color: COLORS.neutral[900] },
  taskRate:       { fontSize: 20, fontWeight: '800', color: COLORS.brand.primary },
  sectionLabel:   { fontSize: 14, fontWeight: '700', color: COLORS.neutral[700], marginTop: 4 },
  photoGrid:      { flexDirection: 'row', gap: 10 },
  photoBox:       {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: COLORS.neutral[100],
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoLabel:     { fontSize: 11, color: COLORS.neutral[400], marginTop: 6, fontWeight: '600' },
  checkOverlay:   {
    position: 'absolute',
    bottom: 6, right: 6,
    backgroundColor: COLORS.brand.primary,
    borderRadius: 12,
    padding: 2,
  },
  startBtn:       {
    backgroundColor: COLORS.brand.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  submitBtn:      {
    backgroundColor: COLORS.brand.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn:      {
    borderRadius: 14,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.status.error,
  },
  cancelBtnText:  { fontSize: 14, fontWeight: '600', color: COLORS.status.error },
  btnDisabled:    { opacity: 0.45 },
})
