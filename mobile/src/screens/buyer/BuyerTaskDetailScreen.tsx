// BuyerTaskDetailScreen — AI score card, approve/reject, live track link
import React, { useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, MapPin, Star, MessageCircle, CheckCircle, XCircle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { StatusBadge }   from '../../components/ui/Badge'
import { Button }        from '../../components/ui/Button'
import { COLORS }        from '../../constants/colors'
import { buyerTasksApi } from '../../api/tasks.api'
import { formatMoney }   from '../../utils/formatMoney'
import { timeAgo }       from '../../utils/timeAgo'
import type { BuyerStackParamList } from '../../navigation/types'

type Nav   = NativeStackNavigationProp<BuyerStackParamList, 'BuyerTaskDetail'>
type Route = RouteProp<BuyerStackParamList, 'BuyerTaskDetail'>

export function BuyerTaskDetailScreen() {
  const navigation   = useNavigation<Nav>()
  const route        = useRoute<Route>()
  const { taskId }   = route.params
  const qc           = useQueryClient()
  const isActing     = useRef(false)

  const { data: task, isLoading } = useQuery({
    queryKey: ['buyer-task', taskId],
    queryFn:  () => buyerTasksApi.getTask(taskId),
  })

  const approveMutation = useMutation({
    mutationFn: () => buyerTasksApi.approve(taskId),
    onMutate:   () => { isActing.current = true },
    onSuccess:  () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      qc.invalidateQueries({ queryKey: ['buyer-tasks-active'] })
      Alert.alert('Approved! 🎉', 'Payment released to the worker.')
    },
    onError: (err: any) => {
      isActing.current = false
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not approve')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => buyerTasksApi.reject(taskId, reason),
    onMutate:   () => { isActing.current = true },
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      Alert.alert('Rejected', 'Worker has been notified and can re-submit.')
    },
    onError: (err: any) => {
      isActing.current = false
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not reject')
    },
  })

  const handleApprove = () => {
    if (isActing.current) return
    Alert.alert('Approve Work?', 'Payment will be released to the worker immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve & Pay', onPress: () => approveMutation.mutate() },
    ])
  }

  const handleReject = () => {
    if (isActing.current) return
    Alert.alert('Reject Work', 'The worker can re-upload photos and resubmit.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => rejectMutation.mutate('Not satisfied with the work quality') },
    ])
  }

  if (isLoading || !task) {
    return <View style={s.loading}><ActivityIndicator size="large" color={COLORS.brand.primary} /></View>
  }

  const canAct = task.status === 'SUBMITTED' || task.status === 'VERIFIED'

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{task.title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status + price */}
        <View style={s.topRow}>
          <View>
            <Text style={s.price}>{formatMoney(task.rateCents)}</Text>
            <Text style={s.updated}>Updated {timeAgo(task.updatedAt)}</Text>
          </View>
          <StatusBadge status={task.status} />
        </View>

        {/* AI Score card */}
        {task.aiScore != null && (
          <View style={[s.aiCard, { borderLeftColor: scoreColor(task.aiScore) }]}>
            <View style={s.aiCardHeader}>
              <Text style={s.aiCardTitle}>AI Verification Score</Text>
              <Text style={[s.aiScore, { color: scoreColor(task.aiScore) }]}>{task.aiScore}%</Text>
            </View>
            {task.aiReasoning && (
              <Text style={s.aiReasoning}>{task.aiReasoning}</Text>
            )}
            <Text style={s.aiNote}>
              {task.aiScore >= 70 ? '✅ AI recommends approval' : '⚠️ AI flagged quality concerns'}
            </Text>
          </View>
        )}

        {/* Worker live track (only during IN_PROGRESS) */}
        {task.status === 'IN_PROGRESS' && task.workerId && (
          <TouchableOpacity
            style={s.trackBtn}
            onPress={() => navigation.navigate('LiveTrack', { taskId })}
            activeOpacity={0.85}
          >
            <MapPin size={18} color={COLORS.brand.primary} />
            <Text style={s.trackBtnText}>Track Worker Live</Text>
          </TouchableOpacity>
        )}

        {/* Description */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Task Details</Text>
          <Text style={s.desc}>{task.description}</Text>
          {task.locationAddress && (
            <View style={s.locationRow}>
              <MapPin size={14} color={COLORS.neutral[500]} />
              <Text style={s.location}>{task.locationAddress}</Text>
            </View>
          )}
        </View>

        {/* Worker info */}
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
                <MessageCircle size={20} color={COLORS.brand.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Approve/Reject footer */}
      {canAct && (
        <View style={s.footer}>
          <Button
            label={rejectMutation.isPending ? '...' : 'Reject'}
            onPress={handleReject}
            variant="danger"
            loading={rejectMutation.isPending}
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

      {/* Rate button after APPROVED */}
      {task.status === 'APPROVED' && !task.payout && (
        <View style={s.footer}>
          <Button
            label="Rate Worker"
            onPress={() => navigation.navigate('Rating', { taskId })}
            fullWidth
            variant="secondary"
          />
        </View>
      )}
    </View>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return COLORS.brand.primary
  if (score >= 60) return '#D97706'
  return COLORS.status.error
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: COLORS.surface },
  loading:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center' },
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  price:      { fontSize: 28, fontWeight: '800', color: COLORS.brand.primary },
  updated:    { fontSize: 12, color: COLORS.neutral[400], marginTop: 2 },
  aiCard:     { marginHorizontal: 20, marginBottom: 16, backgroundColor: COLORS.neutral[50], borderRadius: 14, padding: 16, borderLeftWidth: 4 },
  aiCardHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiCardTitle:{ fontSize: 14, fontWeight: '700', color: COLORS.neutral[800] },
  aiScore:    { fontSize: 28, fontWeight: '800' },
  aiReasoning:{ fontSize: 13, color: COLORS.neutral[600], lineHeight: 20, marginBottom: 8 },
  aiNote:     { fontSize: 12, fontWeight: '600', color: COLORS.neutral[600] },
  trackBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 16, backgroundColor: COLORS.brand.tint, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: COLORS.brand.primary },
  trackBtnText:{ fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  section:    { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: COLORS.neutral[800], marginBottom: 8 },
  desc:       { fontSize: 14, color: COLORS.neutral[600], lineHeight: 22 },
  locationRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  location:   { fontSize: 13, color: COLORS.neutral[500] },
  workerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.neutral[50], borderRadius: 14, padding: 14 },
  workerAvatar:{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.brand.primary, alignItems: 'center', justifyContent: 'center' },
  workerInitial:{ fontSize: 20, fontWeight: '700', color: '#fff' },
  workerName: { fontSize: 15, fontWeight: '700', color: COLORS.neutral[900] },
  workerEmail:{ fontSize: 12, color: COLORS.neutral[500], marginTop: 2 },
  chatBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brand.tint, alignItems: 'center', justifyContent: 'center' },
  footer:     { flexDirection: 'row', gap: 12, padding: 20, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerBtn:  { flex: 1 },
})
