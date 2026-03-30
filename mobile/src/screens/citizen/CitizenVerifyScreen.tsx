/**
 * CitizenVerifyScreen — Crowd-sourced post-task verification.
 * Citizen sees worker's "after" photo, takes current photo, rates area.
 * Reward: ₹2 (rating only), ₹5 (photo + clean), ₹10 (photo + found fraud).
 */

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import * as Location from 'expo-location'
import { CheckCircle, Camera, AlertTriangle, ThumbsUp } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { COLORS } from '../../constants/colors'
import { apiClient } from '../../api/client'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import type { CaptureResult } from '../../components/camera/CaptureCamera'

interface VerifyTask {
  id: string
  title: string
  completedAt: string | null
  location: { lat: number; lng: number }
  distanceMeters: number
  workerAfterImageUrl: string | null
  rewardAmount: number
}

export function CitizenVerifyScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const qc = useQueryClient()
  const [selectedTask, setSelectedTask] = useState<VerifyTask | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null)

  // Get citizen's location
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  React.useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((l) => setLoc({ lat: l.coords.latitude, lng: l.coords.longitude }))
      .catch(() => {})
  }, [])

  // Fetch nearby tasks to verify
  const { data: tasks, isLoading } = useQuery<VerifyTask[]>({
    queryKey: ['citizen-verify-tasks', loc?.lat, loc?.lng],
    queryFn: () => apiClient.get('/citizen/verify-tasks', {
      params: { lat: loc!.lat, lng: loc!.lng },
    }).then((r) => r.data.tasks),
    enabled: !!loc,
    staleTime: 60_000,
  })

  // Submit verification
  const submitMutation = useMutation({
    mutationFn: (params: { taskId: string; rating: string; photoUrl?: string }) =>
      apiClient.post(`/citizen/verify/${params.taskId}`, {
        rating: params.rating,
        photoUrl: params.photoUrl,
        capturedLat: loc?.lat,
        capturedLng: loc?.lng,
      }),
    onSuccess: (res) => {
      const msg = res.data?.verification?.message ?? 'Thank you!'
      Alert.alert('Verified!', msg)
      setSelectedTask(null)
      setCapturedPhotoUri(null)
      qc.invalidateQueries({ queryKey: ['citizen-verify-tasks'] })
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not submit verification')
    },
  })

  const handleRate = (rating: 'CLEAN' | 'PARTIALLY_CLEAN' | 'DIRTY') => {
    if (!selectedTask) return
    submitMutation.mutate({
      taskId: selectedTask.id,
      rating,
      photoUrl: capturedPhotoUri ?? undefined,
    })
  }

  if (isLoading || !loc) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.brand.primary} /></View>
  }

  // Task detail view
  if (selectedTask) {
    return (
      <View style={s.root}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Text style={s.headerTitle}>Verify Task</Text>
        </View>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.taskTitle}>{selectedTask.title}</Text>
          <Text style={s.subtitle}>{selectedTask.distanceMeters}m from you</Text>

          {selectedTask.workerAfterImageUrl && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Worker's "after" photo</Text>
              <Image source={{ uri: selectedTask.workerAfterImageUrl }} style={s.afterImage} />
            </View>
          )}

          {capturedPhotoUri && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Your photo</Text>
              <Image source={{ uri: capturedPhotoUri }} style={s.afterImage} />
            </View>
          )}

          {!capturedPhotoUri && (
            <TouchableOpacity style={s.cameraBtn} onPress={() => setCameraOpen(true)}>
              <Camera size={20} color={COLORS.brand.primary} />
              <Text style={s.cameraBtnText}>Take a photo of this area now</Text>
            </TouchableOpacity>
          )}

          <Text style={s.sectionTitle}>Is this area clean?</Text>
          <View style={s.ratingRow}>
            <TouchableOpacity
              style={[s.rateBtn, s.rateBtnClean]}
              onPress={() => handleRate('CLEAN')}
              disabled={submitMutation.isPending}
            >
              <ThumbsUp size={20} color="#16A34A" />
              <Text style={[s.rateBtnText, { color: '#16A34A' }]}>Clean</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.rateBtn, s.rateBtnPartial]}
              onPress={() => handleRate('PARTIALLY_CLEAN')}
              disabled={submitMutation.isPending}
            >
              <CheckCircle size={20} color="#D97706" />
              <Text style={[s.rateBtnText, { color: '#D97706' }]}>Partial</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.rateBtn, s.rateBtnDirty]}
              onPress={() => handleRate('DIRTY')}
              disabled={submitMutation.isPending}
            >
              <AlertTriangle size={20} color="#DC2626" />
              <Text style={[s.rateBtnText, { color: '#DC2626' }]}>Dirty</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.rewardNote}>
            Reward: {capturedPhotoUri ? '₹5-10' : '₹2'} (take a photo for higher reward)
          </Text>
        </ScrollView>

        <TouchableOpacity style={s.backLink} onPress={() => { setSelectedTask(null); setCapturedPhotoUri(null) }}>
          <Text style={s.backLinkText}>Back to list</Text>
        </TouchableOpacity>

        <Modal visible={cameraOpen} animationType="slide" statusBarTranslucent>
          <CaptureCamera
            taskId={null}
            photoType="GENERAL"
            onCapture={(result: CaptureResult) => {
              setCameraOpen(false)
              setCapturedPhotoUri(result.photo.fullUri)
            }}
            onClose={() => setCameraOpen(false)}
          />
        </Modal>
      </View>
    )
  }

  // Task list
  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.headerTitle}>Verify Nearby</Text>
        <Text style={s.headerSub}>Help verify completed tasks for rewards</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {(!tasks || tasks.length === 0) && (
          <View style={s.emptyState}>
            <CheckCircle size={48} color={COLORS.brand.primary} />
            <Text style={s.emptyTitle}>No tasks to verify nearby</Text>
            <Text style={s.emptySub}>Check back later — tasks appear 1-48 hours after completion</Text>
          </View>
        )}
        {tasks?.map((task) => (
          <TouchableOpacity
            key={task.id}
            style={s.taskCard}
            onPress={() => setSelectedTask(task)}
            activeOpacity={0.85}
          >
            <View style={s.taskCardLeft}>
              {task.workerAfterImageUrl && (
                <Image source={{ uri: task.workerAfterImageUrl }} style={s.taskCardThumb} />
              )}
            </View>
            <View style={s.taskCardRight}>
              <Text style={s.taskCardTitle}>{task.title}</Text>
              <Text style={s.taskCardDist}>{task.distanceMeters}m away</Text>
              <Text style={s.taskCardReward}>Earn ₹{task.rewardAmount / 100}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F8FAFC' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  headerSub:   { fontSize: 14, color: '#64748B', marginTop: 4 },
  content:     { padding: 20, gap: 12 },

  taskTitle:   { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  subtitle:    { fontSize: 14, color: '#64748B', marginBottom: 12 },
  section:     { marginBottom: 16 },
  sectionTitle:{ fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  afterImage:  { width: '100%', height: 200, borderRadius: 14 },

  cameraBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, paddingVertical: 36, borderWidth: 1.5, borderColor: '#BFDBFE', borderStyle: 'dashed' as any, marginBottom: 16 },
  cameraBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.brand.primary },

  ratingRow:  { flexDirection: 'row', gap: 10, marginBottom: 12 },
  rateBtn:    { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center', gap: 6, borderWidth: 1.5 },
  rateBtnClean:  { borderColor: '#16A34A30', backgroundColor: '#16A34A08' },
  rateBtnPartial:{ borderColor: '#D9770630', backgroundColor: '#D9770608' },
  rateBtnDirty:  { borderColor: '#DC262630', backgroundColor: '#DC262608' },
  rateBtnText:   { fontSize: 13, fontWeight: '700' },
  rewardNote:    { fontSize: 12, color: '#64748B', textAlign: 'center' },

  backLink:     { padding: 20, alignItems: 'center' },
  backLinkText: { fontSize: 14, color: COLORS.brand.primary, fontWeight: '600' },

  emptyState:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  emptySub:     { fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 260 },

  taskCard:      { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  taskCardLeft:  { width: 70 },
  taskCardThumb: { width: 70, height: 70, borderRadius: 10 },
  taskCardRight: { flex: 1, justifyContent: 'center' },
  taskCardTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  taskCardDist:  { fontSize: 12, color: '#64748B', marginTop: 4 },
  taskCardReward:{ fontSize: 13, fontWeight: '700', color: COLORS.brand.primary, marginTop: 4 },
})
