import React, { useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { CheckCircle, Clock, MapPin, ImageIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi } from '../../api/tasks.api'
import { mediaApi } from '../../api/media.api'
import { useActiveTaskStore } from '../../stores/activeTaskStore'
import { useBackgroundLocation } from '../../hooks/useBackgroundLocation'
import { formatMoney } from '../../utils/formatMoney'
import type { WorkerStackParamList } from '../../navigation/types'
import type { MediaType } from '../../types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList, 'SubmitProof'>
type Route = RouteProp<WorkerStackParamList, 'SubmitProof'>

function formatElapsed(secs: number): string {
  const h   = Math.floor(secs / 3600)
  const m   = Math.floor((secs % 3600) / 60)
  const s   = secs % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function SubmitProofScreen() {
  const navigation    = useNavigation<Nav>()
  const route         = useRoute<Route>()
  const { taskId }    = route.params
  const queryClient   = useQueryClient()
  const isSubmitting  = useRef(false)
  const insets        = useSafeAreaInsets()
  const [showConfirm, setShowConfirm] = useState(false)

  const { elapsedSecs, gpsTrail, setActiveTask } = useActiveTaskStore()
  const { stopTracking } = useBackgroundLocation()

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['worker', 'task', taskId],
    queryFn:  () => workerTasksApi.getTask(taskId),
  })

  const { data: mediaList, isLoading: mediaLoading } = useQuery({
    queryKey: ['task', 'media', taskId],
    queryFn:  () => mediaApi.list(taskId),
  })

  const submitMutation = useMutation({
    mutationFn: () => workerTasksApi.submit(taskId),
    onSuccess: async () => {
      isSubmitting.current = false
      await stopTracking()
      setActiveTask(null)
      queryClient.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      queryClient.invalidateQueries({ queryKey: ['worker', 'wallet'] })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as never)
    },
    onError: (err: any) => {
      isSubmitting.current = false
      Alert.alert('Submission Failed', err?.response?.data?.error?.message ?? 'Please try again.')
    },
  })

  const handleSubmit = () => {
    if (isSubmitting.current) return
    setShowConfirm(true)
  }

  const confirmSubmit = () => {
    setShowConfirm(false)
    if (isSubmitting.current) return
    isSubmitting.current = true
    submitMutation.mutate()
  }

  const getMediaByType = (type: MediaType) =>
    mediaList?.find((m) => m.type === type)

  const photoTypes: { type: MediaType; label: string }[] = [
    { type: 'BEFORE', label: 'Before' },
    { type: 'AFTER',  label: 'After'  },
    { type: 'PROOF',  label: 'Proof'  },
  ]

  if (taskLoading || mediaLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={W.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Review & Submit</Text>
        <Text style={styles.headerSub}>{task?.title ?? ''}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Photos ── */}
        <Text style={styles.sectionTitle}>Your Photos</Text>
        {photoTypes.map(({ type, label }) => {
          const media = getMediaByType(type)
          return (
            <View key={type} style={styles.photoRow}>
              <View style={styles.photoPreview}>
                {media ? (
                  <Image source={{ uri: media.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={styles.noPhoto}>
                    <ImageIcon size={28} color={W.text.muted} />
                    <Text style={styles.noPhotoText}>Not uploaded</Text>
                  </View>
                )}
              </View>
              <View style={styles.photoInfo}>
                <Text style={styles.photoLabel}>{label} Photo</Text>
                {media ? (
                  <View style={styles.checkRow}>
                    <CheckCircle size={16} color={W.status.success} />
                    <Text style={styles.checkText}>Uploaded</Text>
                  </View>
                ) : (
                  <Text style={styles.missingText}>Missing — go back to upload</Text>
                )}
              </View>
            </View>
          )
        })}

        {/* ── Checklist ── */}
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.checklist}>
          <CheckRow
            icon={<MapPin size={16} color={W.primary} />}
            label="GPS trail recorded"
            value={`${gpsTrail.length} points`}
            ok={gpsTrail.length > 0}
          />
          <CheckRow
            icon={<CheckCircle size={16} color={W.primary} />}
            label="Photos uploaded"
            value={`${photoTypes.filter(({ type }) => !!getMediaByType(type)).length} / 3`}
            ok={photoTypes.every(({ type }) => !!getMediaByType(type))}
          />
          <CheckRow
            icon={<Clock size={16} color={W.primary} />}
            label="Time on site"
            value={formatElapsed(elapsedSecs)}
            ok={elapsedSecs > 0}
          />
          {task && (
            <CheckRow
              icon={<CheckCircle size={16} color={W.primary} />}
              label="Earnings on approval"
              value={formatMoney(task.rateCents, 'INR')}
              ok
            />
          )}
        </View>
      </ScrollView>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, submitMutation.isPending && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
          activeOpacity={0.85}
        >
          {submitMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Submit Work</Text>}
        </TouchableOpacity>
      </View>

      {/* ── Submit Confirmation Modal ── */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Submit this task?</Text>
            <Text style={styles.modalBody}>
              Once submitted, the buyer will review your photos and AI will verify the work.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmSubmit}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function CheckRow({
  icon, label, value, ok,
}: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.checkRowContainer}>
      {icon}
      <Text style={styles.checkRowLabel}>{label}</Text>
      <Text style={[styles.checkRowValue, { color: ok ? W.status.success : W.status.warning }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: W.background },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          {
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: W.surface,
    borderBottomWidth: 1,
    borderBottomColor: W.border,
  },
  headerTitle:     { fontSize: 22, fontWeight: '800', color: W.text.primary },
  headerSub:       { fontSize: 14, color: W.text.secondary, marginTop: 4 },
  content:         { padding: 20, gap: 12, paddingBottom: 32 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: W.text.primary, marginTop: 8 },
  photoRow:        {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: W.surface,
    borderRadius: 14,
    padding: 12,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  photoPreview:    { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: W.primaryTint },
  noPhoto:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  noPhotoText:     { fontSize: 10, color: W.text.muted },
  photoInfo:       { flex: 1, gap: 6 },
  photoLabel:      { fontSize: 14, fontWeight: '600', color: W.text.primary },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkText:       { fontSize: 13, color: W.status.success, fontWeight: '500' },
  missingText:     { fontSize: 12, color: W.status.warning },
  checklist:       {
    backgroundColor: W.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  checkRowContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkRowLabel:   { flex: 1, fontSize: 14, color: W.text.secondary },
  checkRowValue:   { fontSize: 14, fontWeight: '700' },
  footer:          {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: W.surface,
    borderTopWidth: 1,
    borderTopColor: W.border,
  },
  backBtn:         {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: W.border,
  },
  backBtnText:     { fontSize: 15, fontWeight: '600', color: W.text.secondary },
  submitBtn:       {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: W.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDisabled:     { opacity: 0.5 },
  modalOverlay:    {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard:       {
    backgroundColor: W.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle:      { fontSize: 18, fontWeight: '700', color: W.text.primary, marginBottom: 8 },
  modalBody:       { fontSize: 14, color: W.text.secondary, lineHeight: 20, marginBottom: 24 },
  modalButtons:    { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: W.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: W.text.secondary },
  modalConfirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: W.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
