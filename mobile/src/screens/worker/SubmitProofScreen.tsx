import React, { useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { CheckCircle, Clock, MapPin, ImageIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { COLORS } from '../../constants/colors'
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
      Alert.alert(
        'Submitted!',
        'Your work has been submitted. AI verification is running — you\'ll be notified when the buyer reviews it.',
        [{
          text: 'View My Tasks',
          onPress: () => navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as never),
        }],
      )
    },
    onError: (err: any) => {
      isSubmitting.current = false
      Alert.alert('Submission Failed', err?.response?.data?.error?.message ?? 'Please try again.')
    },
  })

  const handleSubmit = () => {
    if (isSubmitting.current) return
    Alert.alert(
      'Submit Work',
      'Once submitted, the buyer will review your photos and AI will verify the work.',
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Submit Now',
          onPress: () => {
            if (isSubmitting.current) return
            isSubmitting.current = true
            submitMutation.mutate()
          },
        },
      ],
    )
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
        <ActivityIndicator color={COLORS.brand.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
                    <ImageIcon size={28} color={COLORS.neutral[300]} />
                    <Text style={styles.noPhotoText}>Not uploaded</Text>
                  </View>
                )}
              </View>
              <View style={styles.photoInfo}>
                <Text style={styles.photoLabel}>{label} Photo</Text>
                {media ? (
                  <View style={styles.checkRow}>
                    <CheckCircle size={16} color={COLORS.status.success} />
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
            icon={<MapPin size={16} color={COLORS.brand.primary} />}
            label="GPS trail recorded"
            value={`${gpsTrail.length} points`}
            ok={gpsTrail.length > 0}
          />
          <CheckRow
            icon={<CheckCircle size={16} color={COLORS.brand.primary} />}
            label="Photos uploaded"
            value={`${photoTypes.filter(({ type }) => !!getMediaByType(type)).length} / 3`}
            ok={photoTypes.every(({ type }) => !!getMediaByType(type))}
          />
          <CheckRow
            icon={<Clock size={16} color={COLORS.brand.primary} />}
            label="Time on site"
            value={formatElapsed(elapsedSecs)}
            ok={elapsedSecs > 0}
          />
          {task && (
            <CheckRow
              icon={<CheckCircle size={16} color={COLORS.brand.primary} />}
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
      <Text style={[styles.checkRowValue, { color: ok ? COLORS.status.success : COLORS.status.warning }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          {
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle:     { fontSize: 22, fontWeight: '800', color: COLORS.neutral[900] },
  headerSub:       { fontSize: 14, color: COLORS.neutral[500], marginTop: 4 },
  content:         { padding: 20, gap: 12, paddingBottom: 32 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: COLORS.neutral[800], marginTop: 8 },
  photoRow:        {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  photoPreview:    { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: COLORS.neutral[100] },
  noPhoto:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  noPhotoText:     { fontSize: 10, color: COLORS.neutral[400] },
  photoInfo:       { flex: 1, gap: 6 },
  photoLabel:      { fontSize: 14, fontWeight: '600', color: COLORS.neutral[900] },
  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkText:       { fontSize: 13, color: COLORS.status.success, fontWeight: '500' },
  missingText:     { fontSize: 12, color: COLORS.status.warning },
  checklist:       {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  checkRowContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkRowLabel:   { flex: 1, fontSize: 14, color: COLORS.neutral[700] },
  checkRowValue:   { fontSize: 14, fontWeight: '700' },
  footer:          {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  backBtn:         {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText:     { fontSize: 15, fontWeight: '600', color: COLORS.neutral[700] },
  submitBtn:       {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDisabled:     { opacity: 0.5 },
})
