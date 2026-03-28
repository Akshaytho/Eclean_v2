import React, { useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { ArrowLeft, MapPin, Clock, DollarSign, Briefcase, AlertTriangle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

import { COLORS } from '../../constants/colors'
import { DIRTY_LEVELS } from '../../constants/taskCategories'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import { useSocketStore } from '../../stores/socketStore'
import type { WorkerStackParamList } from '../../navigation/types'
import type { DirtyLevel } from '../../types'

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

  // Double-tap prevention
  const isAccepting = useRef(false)

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
      Alert.alert('Cannot Accept', msg)
    },
  })

  const handleAccept = () => {
    if (isAccepting.current) return
    Alert.alert(
      'Accept Task',
      `Accept "${task?.title}" for ${formatMoney(task?.rateCents ?? 0, 'INR')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            if (isAccepting.current) return
            isAccepting.current = true
            acceptMutation.mutate()
          },
        },
      ],
    )
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.brand.primary} size="large" />
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
          <ArrowLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{task.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* ── Mini Map ── */}
        {hasLocation ? (
          <MapView
            style={styles.miniMap}
            initialRegion={{
              latitude:       task.locationLat!,
              longitude:      task.locationLng!,
              latitudeDelta:  0.008,
              longitudeDelta: 0.008,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker
              coordinate={{ latitude: task.locationLat!, longitude: task.locationLng! }}
              pinColor={dirtyColor}
            />
          </MapView>
        ) : (
          <View style={styles.noMap}>
            <MapPin size={24} color={COLORS.neutral[400]} />
            <Text style={styles.noMapText}>No location specified</Text>
          </View>
        )}

        {/* ── Rate ── */}
        <View style={styles.rateCard}>
          <DollarSign size={20} color={COLORS.brand.primary} />
          <Text style={styles.rateAmount}>{formatMoney(task.rateCents, 'INR')}</Text>
          <View style={[styles.dirtyBadge, { backgroundColor: dirtyColor }]}>
            <Text style={styles.dirtyText}>{task.dirtyLevel}</Text>
          </View>
        </View>

        {/* ── Reference Photo (from buyer) ── */}
        {task.media?.filter(m => m.type === 'REFERENCE').map(m => (
          <View key={m.id} style={styles.refPhotoCard}>
            <Image source={{ uri: m.url }} style={styles.refPhotoImg} resizeMode="cover" />
            <Text style={styles.refPhotoLabel}>Photo from buyer</Text>
          </View>
        ))}

        {/* ── Description ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <Text style={styles.description}>{task.description}</Text>
        </View>

        {/* ── Details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <DetailRow icon={<Briefcase size={16} color={COLORS.neutral[500]} />} label="Category" value={task.category.replace(/_/g, ' ')} />
          <DetailRow icon={<AlertTriangle size={16} color={COLORS.neutral[500]} />} label="Urgency" value={task.urgency} />
          {task.locationAddress && (
            <DetailRow icon={<MapPin size={16} color={COLORS.neutral[500]} />} label="Location" value={task.locationAddress} />
          )}
          {task.workWindowStart && (
            <DetailRow
              icon={<Clock size={16} color={COLORS.neutral[500]} />}
              label="Work Window"
              value={`${new Date(task.workWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(task.workWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            />
          )}
          {(task as any).buyer && (
            <DetailRow icon={<Briefcase size={16} color={COLORS.neutral[500]} />} label="Posted by" value={(task as any).buyer.name} />
          )}
        </View>
      </ScrollView>

      {/* ── Accept Button ── */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.acceptBtn, acceptMutation.isPending && styles.acceptBtnDisabled]}
          onPress={handleAccept}
          activeOpacity={0.85}
          disabled={acceptMutation.isPending}
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptBtnText}>Accept Task — {formatMoney(task.rateCents, 'INR')}</Text>
          )}
        </TouchableOpacity>
      </View>
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
  container:      { flex: 1, backgroundColor: COLORS.background },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:      { fontSize: 16, color: COLORS.neutral[600], marginBottom: 12 },
  backLink:       { color: COLORS.brand.primary, fontSize: 15, fontWeight: '600' },
  topBar:         {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle:    { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center' },
  content:        { padding: 16, paddingBottom: 32, gap: 12 },
  miniMap:        { height: 180, borderRadius: 14, overflow: 'hidden' },
  noMap:          { height: 100, borderRadius: 14, backgroundColor: COLORS.neutral[100], alignItems: 'center', justifyContent: 'center', gap: 8 },
  noMapText:      { fontSize: 13, color: COLORS.neutral[400] },
  refPhotoCard:   { borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.surface },
  refPhotoImg:    { width: '100%', height: 200, borderRadius: 14 },
  refPhotoLabel:  { fontSize: 12, color: COLORS.neutral[500], textAlign: 'center', paddingVertical: 8 },
  rateCard:       {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  rateAmount:     { fontSize: 24, fontWeight: '800', color: COLORS.brand.primary, flex: 1 },
  dirtyBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dirtyText:      { fontSize: 12, fontWeight: '700', color: '#fff' },
  card:           {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle:      { fontSize: 14, fontWeight: '700', color: COLORS.neutral[700], marginBottom: 4 },
  description:    { fontSize: 14, color: COLORS.neutral[700], lineHeight: 20 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailLabel:    { fontSize: 13, color: COLORS.neutral[500], width: 90 },
  detailValue:    { fontSize: 13, color: COLORS.neutral[800], flex: 1, fontWeight: '500' },
  footer:         {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  acceptBtn:      {
    backgroundColor: COLORS.brand.primary,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
})
