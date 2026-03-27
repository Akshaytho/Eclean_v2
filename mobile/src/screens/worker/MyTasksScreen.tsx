import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import { timeAgo } from '../../utils/timeAgo'
import type { Task, TaskStatus } from '../../types'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

type Tab = 'active' | 'completed' | 'cancelled'

const TAB_STATUSES: Record<Tab, string> = {
  active:    'ACCEPTED,IN_PROGRESS,SUBMITTED,DISPUTED',
  completed: 'APPROVED,COMPLETED,VERIFIED',
  cancelled: 'CANCELLED,REJECTED',
}

const STATUS_COLOR: Partial<Record<TaskStatus, string>> = {
  ACCEPTED:    COLORS.status.info,
  IN_PROGRESS: COLORS.brand.primary,
  SUBMITTED:   COLORS.status.warning,
  APPROVED:    COLORS.status.success,
  COMPLETED:   COLORS.status.success,
  VERIFIED:    COLORS.status.success,
  REJECTED:    COLORS.status.error,
  CANCELLED:   COLORS.neutral[400],
  DISPUTED:    COLORS.status.error,
}

const STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  ACCEPTED:    'Accepted',
  IN_PROGRESS: 'In Progress',
  SUBMITTED:   'Awaiting Review',
  APPROVED:    'Approved',
  COMPLETED:   'Completed',
  VERIFIED:    'AI Verified',
  REJECTED:    'Rejected',
  CANCELLED:   'Cancelled',
  DISPUTED:    'Disputed',
}

export function MyTasksScreen() {
  const navigation = useNavigation<Nav>()
  const [activeTab, setActiveTab] = useState<Tab>('active')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['worker', 'my-tasks', activeTab],
    queryFn:  () => workerTasksApi.myTasks({ status: TAB_STATUSES[activeTab], limit: 50 }),
    staleTime: 15_000,
  })

  const tasks = data?.tasks ?? []

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tasks</Text>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        {(['active', 'completed', 'cancelled'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <ActivityIndicator color={COLORS.brand.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              {activeTab === 'active'
                ? <Clock size={40} color={COLORS.neutral[300]} />
                : activeTab === 'completed'
                  ? <CheckCircle size={40} color={COLORS.neutral[300]} />
                  : <XCircle size={40} color={COLORS.neutral[300]} />}
              <Text style={styles.emptyText}>No {activeTab} tasks</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
              onContinue={
                (item.status === 'ACCEPTED' || item.status === 'IN_PROGRESS')
                  ? () => navigation.navigate('ActiveTask', { taskId: item.id })
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
  )
}

function TaskRow({
  task, onPress, onContinue,
}: { task: Task; onPress: () => void; onContinue?: () => void }) {
  const statusColor = STATUS_COLOR[task.status] ?? COLORS.neutral[400]
  const statusLabel = STATUS_LABEL[task.status] ?? task.status

  return (
    <TouchableOpacity style={styles.taskCard} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.taskTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
          <Text style={styles.taskMeta}>{timeAgo(task.createdAt)}</Text>
        </View>
        <Text style={styles.taskRate}>{formatMoney(task.rateCents, 'INR')}</Text>
      </View>
      <View style={styles.taskBottom}>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {onContinue && (
          <TouchableOpacity style={styles.continueBtn} onPress={onContinue}>
            <Text style={styles.continueBtnText}>Continue →</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.background },
  header:         {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: COLORS.neutral[900] },
  tabs:           {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab:            {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.neutral[100],
  },
  tabActive:      { backgroundColor: COLORS.brand.primary },
  tabText:        { fontSize: 13, fontWeight: '600', color: COLORS.neutral[600] },
  tabTextActive:  { color: '#fff' },
  list:           { padding: 16, paddingBottom: 40 },
  empty:          { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:      { fontSize: 15, color: COLORS.neutral[500] },
  taskCard:       {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  taskTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  taskTitle:      { fontSize: 15, fontWeight: '600', color: COLORS.neutral[900], marginBottom: 3 },
  taskMeta:       { fontSize: 12, color: COLORS.neutral[400] },
  taskRate:       { fontSize: 16, fontWeight: '700', color: COLORS.brand.primary, marginLeft: 8 },
  taskBottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  statusText:     { fontSize: 12, fontWeight: '600' },
  continueBtn:    {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.brand.tint,
  },
  continueBtnText:{ fontSize: 13, fontWeight: '700', color: COLORS.brand.primary },
})
