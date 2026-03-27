import React from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { MapPin, CheckCircle, Star, ChevronRight, Search } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
import { payoutsApi } from '../../api/payouts.api'
import { workerTasksApi } from '../../api/tasks.api'
import { useAuthStore } from '../../stores/authStore'
import { formatMoney } from '../../utils/formatMoney'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

export function WorkerHomeScreen() {
  const navigation = useNavigation<Nav>()
  const user       = useAuthStore((s) => s.user)

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['worker', 'wallet'],
    queryFn:  payoutsApi.getWallet,
    staleTime: 30_000,
  })

  // Active task: IN_PROGRESS or ACCEPTED
  const { data: inProgress } = useQuery({
    queryKey: ['worker', 'tasks', 'active'],
    queryFn:  () => workerTasksApi.myTasks({ status: 'IN_PROGRESS', limit: 1 }),
    staleTime: 10_000,
  })

  const { data: accepted } = useQuery({
    queryKey: ['worker', 'tasks', 'accepted'],
    queryFn:  () => workerTasksApi.myTasks({ status: 'ACCEPTED', limit: 1 }),
    staleTime: 10_000,
  })

  const activeTask = inProgress?.tasks[0] ?? accepted?.tasks[0] ?? null

  const firstName = user?.name?.split(' ')[0] ?? 'Worker'

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[COLORS.brand.dark, COLORS.brand.primary]}
        style={styles.header}
      >
        <Text style={styles.greeting}>Hi {firstName} 👋</Text>
        <Text style={styles.subtitle}>Ready to earn today?</Text>

        {walletLoading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.earningsRow}>
            <EarningPill
              label="Available"
              value={formatMoney(wallet?.availableCents ?? 0, 'INR')}
            />
            <EarningPill
              label="Pending"
              value={formatMoney(wallet?.pendingCents ?? 0, 'INR')}
            />
            <EarningPill
              label="Total Earned"
              value={formatMoney(wallet?.totalEarnedCents ?? 0, 'INR')}
            />
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Active Task Card ── */}
        {activeTask && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Task</Text>
            <TouchableOpacity
              style={styles.activeTaskCard}
              onPress={() => navigation.navigate('ActiveTask', { taskId: activeTask.id })}
              activeOpacity={0.85}
            >
              <View style={styles.activeTaskLeft}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: activeTask.status === 'IN_PROGRESS' ? COLORS.status.success : COLORS.status.warning },
                ]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeTaskTitle} numberOfLines={1}>{activeTask.title}</Text>
                  <Text style={styles.activeTaskStatus}>
                    {activeTask.status === 'IN_PROGRESS' ? 'In Progress' : 'Accepted — tap to start'}
                  </Text>
                </View>
              </View>
              <ChevronRight size={20} color={COLORS.neutral[400]} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stats ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsRow}>
            <StatCard
              icon={<CheckCircle size={22} color={COLORS.brand.primary} />}
              value={String(wallet?.completedTasksCount ?? 0)}
              label="Completed"
            />
            <StatCard
              icon={<MapPin size={22} color={COLORS.status.info} />}
              value={activeTask ? '1' : '0'}
              label="Active"
            />
            <StatCard
              icon={<Star size={22} color={COLORS.status.warning} />}
              value="—"
              label="Rating"
            />
          </View>
        </View>

        {/* ── CTA ── */}
        <TouchableOpacity
          style={styles.findWorkBtn}
          onPress={() => navigation.navigate('WorkerTabs', { screen: 'FindWork' } as never)}
          activeOpacity={0.85}
        >
          <Search size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.findWorkBtnText}>Find Work Near Me</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function EarningPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  header:          { paddingTop: 56, paddingBottom: 28, paddingHorizontal: 24 },
  greeting:        { fontSize: 26, fontWeight: '700', color: '#fff' },
  subtitle:        { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  earningsRow:     { flexDirection: 'row', marginTop: 20, gap: 8 },
  pill:            { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' },
  pillValue:       { fontSize: 15, fontWeight: '700', color: '#fff' },
  pillLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  body:            { flex: 1 },
  bodyContent:     { padding: 20, paddingBottom: 40 },
  section:         { marginBottom: 24 },
  sectionTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 12 },
  activeTaskCard:  {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  activeTaskLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot:       { width: 10, height: 10, borderRadius: 5 },
  activeTaskTitle: { fontSize: 15, fontWeight: '600', color: COLORS.neutral[900] },
  activeTaskStatus:{ fontSize: 12, color: COLORS.neutral[500], marginTop: 2 },
  statsRow:        { flexDirection: 'row', gap: 12 },
  statCard:        {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue:       { fontSize: 20, fontWeight: '700', color: COLORS.neutral[900] },
  statLabel:       { fontSize: 11, color: COLORS.neutral[500] },
  findWorkBtn:     {
    backgroundColor: COLORS.brand.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  findWorkBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
