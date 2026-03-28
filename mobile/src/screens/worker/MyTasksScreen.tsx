import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { CheckCircle, Clock, XCircle } from 'lucide-react-native'

import { WORKER_THEME as W } from '../../constants/workerTheme'
import { AppHeader } from '../../components/layout/AppHeader'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import { timeAgo } from '../../utils/timeAgo'
import type { Task, TaskStatus } from '../../types'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

type Tab = 'active' | 'in_review' | 'completed' | 'cancelled'

const TAB_STATUSES: Record<Tab, string[]> = {
  active:    ['ACCEPTED', 'IN_PROGRESS'],
  in_review: ['SUBMITTED', 'VERIFIED', 'DISPUTED'],
  completed: ['APPROVED', 'COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED'],
}

const TAB_LABELS: Record<Tab, string> = {
  active: 'Active',
  in_review: 'In Review',
  completed: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_COLOR: Partial<Record<TaskStatus, string>> = {
  ACCEPTED:    W.status.info,
  IN_PROGRESS: W.primary,
  SUBMITTED:   W.status.warning,
  APPROVED:    W.status.success,
  COMPLETED:   W.status.success,
  VERIFIED:    W.status.success,
  REJECTED:    W.status.error,
  CANCELLED:   W.text.muted,
  DISPUTED:    W.status.error,
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
    queryKey: ['worker', 'my-tasks'],
    queryFn:  () => workerTasksApi.myTasks({ limit: 100 }),
    staleTime: 15_000,
  })

  const allTasks = data?.tasks ?? []
  const tasks = allTasks.filter(t => TAB_STATUSES[activeTab].includes(t.status))

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <AppHeader title="My Tasks" theme="worker" />

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        {(['active', 'in_review', 'completed', 'cancelled'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <ActivityIndicator color={W.primary} style={{ marginTop: 40 }} />
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
                ? <Clock size={40} color={W.text.muted} />
                : activeTab === 'completed'
                  ? <CheckCircle size={40} color={W.text.muted} />
                  : <XCircle size={40} color={W.text.muted} />}
              <Text style={styles.emptyText}>No {activeTab} tasks</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              onPress={() => {
                if (item.status === 'ACCEPTED' || item.status === 'IN_PROGRESS')
                  navigation.navigate('ActiveTask', { taskId: item.id })
                else
                  navigation.navigate('TaskDetail', { taskId: item.id })
              }}
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
  const statusColor = STATUS_COLOR[task.status] ?? W.text.muted
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
  container:      { flex: 1, backgroundColor: W.background },
  tabs:           {
    flexDirection: 'row',
    backgroundColor: W.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: W.border,
  },
  tab:            {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: W.primaryTint,
  },
  tabActive:      { backgroundColor: W.primary },
  tabText:        { fontSize: 13, fontWeight: '600', color: W.text.secondary },
  tabTextActive:  { color: '#fff' },
  list:           { padding: 16, paddingBottom: 40 },
  empty:          { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:      { fontSize: 15, color: W.text.secondary },
  taskCard:       {
    backgroundColor: W.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: W.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  taskTop:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  taskTitle:      { fontSize: 15, fontWeight: '600', color: W.text.primary, marginBottom: 3 },
  taskMeta:       { fontSize: 12, color: W.text.muted },
  taskRate:       { fontSize: 16, fontWeight: '700', color: W.primary, marginLeft: 8 },
  taskBottom:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  statusText:     { fontSize: 12, fontWeight: '600' },
  continueBtn:    {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: W.primaryTint,
  },
  continueBtnText:{ fontSize: 13, fontWeight: '700', color: W.primary },
})
