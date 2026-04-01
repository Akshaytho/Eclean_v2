/**
 * ReportIssueScreen — Cancel task without penalty.
 *
 * Worker arrives and task is impossible (flooded drain, blocked road, etc.)
 * Quick category picker + optional photo = protected cancellation.
 */

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Alert,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, ArrowLeft } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { ScreenWrapper } from '../../components/layout/ScreenWrapper'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi } from '../../api/tasks.api'
import { mediaApi } from '../../api/media.api'
import { useActiveTaskStore } from '../../stores/activeTaskStore'
import { useBackgroundLocation } from '../../hooks/useBackgroundLocation'
import type { CaptureResult } from '../../components/camera/CaptureCamera'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList>
type Route = RouteProp<WorkerStackParamList, 'ReportIssue'>

const ISSUE_CATEGORIES = [
  { id: 'blocked', icon: '\uD83D\uDEA7', label: 'Site blocked / inaccessible' },
  { id: 'safety',  icon: '\u26A0\uFE0F',  label: 'Safety hazard' },
  { id: 'mismatch',icon: '\uD83D\uDCF7', label: "Photos don't match reality" },
  { id: 'weather', icon: '\uD83C\uDF27\uFE0F',  label: 'Weather makes work unsafe' },
  { id: 'other',   icon: '\u2753',  label: 'Other reason' },
]

export function ReportIssueScreen() {
  const navigation = useNavigation<Nav>()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const qc         = useQueryClient()
  const { setActiveTask } = useActiveTaskStore()
  const { stopTracking }  = useBackgroundLocation()

  const [selected, setSelected] = useState<string | null>(null)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => workerTasksApi.cancel(taskId, reason),
    onSuccess: async () => {
      await stopTracking()
      setActiveTask(null)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      qc.invalidateQueries({ queryKey: ['worker', 'tasks'] })
      navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as never)
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not report issue')
    },
  })

  const [uploading, setUploading] = useState(false)

  const handleSubmit = async () => {
    if (!selected) { Alert.alert('Select an issue', 'Please pick what went wrong'); return }
    const category = ISSUE_CATEGORIES.find(c => c.id === selected)

    let evidenceUrl = ''
    // Upload photo evidence to server before cancelling
    if (photoUri) {
      setUploading(true)
      try {
        const uploaded = await mediaApi.upload(taskId, photoUri, 'PROOF')
        evidenceUrl = uploaded?.url ?? ''
      } catch {
        // Non-blocking: still cancel even if upload fails
      }
      setUploading(false)
    }

    const reason = evidenceUrl
      ? `[REPORT] ${category?.label ?? selected} | Evidence: ${evidenceUrl}`
      : `[REPORT] ${category?.label ?? selected}`
    cancelMutation.mutate(reason)
  }

  const onCapture = (result: CaptureResult) => {
    setCameraOpen(false)
    setPhotoUri(result.photo.fullUri)
  }

  return (
    <ScreenWrapper backgroundColor={W.background}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ArrowLeft size={22} color={W.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Report Issue</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        <Text style={s.question}>What's the problem?</Text>

        {/* Category buttons */}
        {ISSUE_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[s.categoryBtn, selected === cat.id && s.categoryBtnSelected]}
            onPress={() => setSelected(cat.id)}
            activeOpacity={0.85}
          >
            <Text style={s.categoryIcon}>{cat.icon}</Text>
            <Text style={[s.categoryLabel, selected === cat.id && s.categoryLabelSelected]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Optional photo */}
        <TouchableOpacity style={s.photoBtn} onPress={() => setCameraOpen(true)} activeOpacity={0.85}>
          <Camera size={18} color={W.primary} />
          <Text style={s.photoBtnText}>
            {photoUri ? 'Photo attached \u2705' : 'Take a photo of the issue (optional)'}
          </Text>
        </TouchableOpacity>
        <Text style={s.photoHint}>A photo helps your case if there's a dispute</Text>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (!selected || cancelMutation.isPending || uploading) && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selected || cancelMutation.isPending || uploading}
          activeOpacity={0.85}
        >
          <Text style={s.submitBtnText}>
            {uploading ? 'Uploading photo...' : cancelMutation.isPending ? 'Submitting...' : 'SUBMIT REPORT'}
          </Text>
          <Text style={s.submitBtnSub}>Task returned to open — no penalty</Text>
        </TouchableOpacity>
      </View>

      {/* Camera modal */}
      <Modal visible={cameraOpen} animationType="slide" statusBarTranslucent>
        <CaptureCamera
          taskId={taskId}
          photoType="GENERAL"
          onCapture={onCapture}
          onClose={() => setCameraOpen(false)}
        />
      </Modal>
    </ScreenWrapper>
  )
}

const s = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: W.surface, borderBottomWidth: 1, borderBottomColor: W.border },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, fontSize: 17, fontWeight: '700', color: W.text.primary, textAlign: 'center' },
  content:      { padding: 20, gap: 10, flex: 1 },
  question:     { fontSize: 18, fontWeight: '700', color: W.text.primary, marginBottom: 8 },

  categoryBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: W.surface, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: W.border },
  categoryBtnSelected: { borderColor: W.primary, backgroundColor: W.primaryTint },
  categoryIcon: { fontSize: 22 },
  categoryLabel:{ fontSize: 15, fontWeight: '600', color: W.text.primary },
  categoryLabelSelected: { color: W.primary },

  photoBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: W.border, borderStyle: 'dashed', marginTop: 8 },
  photoBtnText: { fontSize: 13, color: W.primary, fontWeight: '600' },
  photoHint:    { fontSize: 11, color: W.text.muted, paddingLeft: 4 },

  submitBtn:    { backgroundColor: W.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 'auto' as any },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:{ fontSize: 16, fontWeight: '700', color: '#fff' },
  submitBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
})
