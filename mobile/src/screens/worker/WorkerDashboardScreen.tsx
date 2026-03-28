import React from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  User, ClipboardList, Wallet, ChevronRight,
  Settings, HelpCircle, LogOut, Star, Search,
} from 'lucide-react-native'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { authApi } from '../../api/auth.api'
import { payoutsApi } from '../../api/payouts.api'
import { useAuthStore } from '../../stores/authStore'
import { formatMoney } from '../../utils/formatMoney'
import { AppHeader } from '../../components/layout/AppHeader'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<WorkerStackParamList>

export function WorkerDashboardScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuthStore()

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    staleTime: 60_000,
  })

  const walletQuery = useQuery({
    queryKey: ['worker-wallet'],
    queryFn: payoutsApi.getWallet,
    staleTime: 60_000,
  })

  const profile = meQuery.data?.workerProfile
  const wallet = walletQuery.data

  const tasksDone = profile?.completedTasks ?? wallet?.completedTasksCount ?? 0
  const rating = profile?.rating ?? 0
  const totalEarned = wallet?.totalEarnedCents ?? 0
  const available = wallet?.availableCents ?? 0

  const initials = (user?.name ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const colors = [W.primary, '#3B82F6', '#8B5CF6', W.secondary, '#EC4899', '#06B6D4']
  const colorIdx = (user?.name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  const avatarColor = colors[colorIdx]

  const handleLogout = () => {
    logout()
  }

  const loading = meQuery.isLoading || walletQuery.isLoading

  return (
    <View style={s.root}>
      <AppHeader
        title="Dashboard"
        theme="worker"
        onNotificationPress={() => navigation.navigate('WorkerTabs', { screen: 'FindWork' } as any)}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => { meQuery.refetch(); walletQuery.refetch() }}
            tintColor={W.primary}
          />
        }
      >
        {/* Profile card */}
        <View style={s.profileCard}>
          <View style={[s.avatarLg, { backgroundColor: avatarColor }]}>
            <Text style={s.avatarLgText}>{initials}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.name ?? 'User'}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>Worker</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        {loading ? (
          <ActivityIndicator color={W.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={s.statsRow}>
            <StatCard
              label="Tasks Done"
              value={`${tasksDone}`}
              icon={<ClipboardList size={18} color={W.primary} />}
              color={W.tint.green}
            />
            <StatCard
              label="Rating"
              value={rating > 0 ? rating.toFixed(1) : '--'}
              icon={<Star size={18} color={W.secondary} />}
              color={W.tint.amber}
            />
            <StatCard
              label="Earned"
              value={formatMoney(totalEarned, 'INR')}
              icon={<Wallet size={18} color={W.accent} />}
              color={W.tint.blue}
            />
            <StatCard
              label="Available"
              value={formatMoney(available, 'INR')}
              icon={<Wallet size={18} color="#8B5CF6" />}
              color={W.tint.purple}
            />
          </View>
        )}

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => navigation.navigate('WorkerTabs', { screen: 'FindWork' } as any)}
            activeOpacity={0.85}
          >
            <View style={[s.actionIcon, { backgroundColor: W.primaryTint }]}>
              <Search size={22} color={W.primary} />
            </View>
            <Text style={s.actionLabel}>Find Work</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionCard}
            onPress={() => navigation.navigate('WorkerTabs', { screen: 'MyTasks' } as any)}
            activeOpacity={0.85}
          >
            <View style={[s.actionIcon, { backgroundColor: W.secondaryLight }]}>
              <ClipboardList size={22} color={W.secondary} />
            </View>
            <Text style={s.actionLabel}>My Tasks</Text>
          </TouchableOpacity>
        </View>

        {/* Menu */}
        <Text style={s.sectionTitle}>Account</Text>
        <View style={s.menuCard}>
          <MenuItem icon={<User size={18} color={W.text.secondary} />} label="Edit Profile" onPress={() => {}} />
          <MenuItem icon={<Settings size={18} color={W.text.secondary} />} label="Settings" onPress={() => {}} />
          <MenuItem icon={<HelpCircle size={18} color={W.text.secondary} />} label="Help & Support" onPress={() => {}} />
          <MenuItem icon={<LogOut size={18} color={W.status.error} />} label="Logout" onPress={handleLogout} danger />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <View style={[s.statCard, { backgroundColor: color }]}>
      {icon}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function MenuItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.8}>
      {icon}
      <Text style={[s.menuLabel, danger && { color: W.status.error }]}>{label}</Text>
      <ChevronRight size={16} color={W.text.muted} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: W.background },
  scroll:       { flex: 1 },
  content:      { padding: 20, paddingTop: 16 },

  // Profile
  profileCard:  { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: W.surface, borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: W.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
  avatarLg:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  profileInfo:  { flex: 1 },
  profileName:  { fontSize: 18, fontWeight: '800', color: W.text.primary },
  profileEmail: { fontSize: 13, color: W.text.muted, marginTop: 2 },
  roleBadge:    { alignSelf: 'flex-start', backgroundColor: W.primaryTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  roleText:     { fontSize: 11, fontWeight: '700', color: W.primary },

  // Stats
  statsRow:     { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statCard:     { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  statValue:    { fontSize: 16, fontWeight: '800', color: W.text.primary },
  statLabel:    { fontSize: 10, fontWeight: '600', color: W.text.secondary },

  // Section
  sectionTitle: { fontSize: 15, fontWeight: '700', color: W.text.primary, marginBottom: 10 },

  // Quick actions
  actionsRow:   { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionCard:   { flex: 1, backgroundColor: W.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: W.border },
  actionIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 13, fontWeight: '700', color: W.text.primary },

  // Menu
  menuCard:     { backgroundColor: W.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: W.border },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: W.divider },
  menuLabel:    { flex: 1, fontSize: 14, fontWeight: '600', color: W.text.primary },
})
