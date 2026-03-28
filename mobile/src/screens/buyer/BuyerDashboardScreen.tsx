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
  Settings, HelpCircle, LogOut, Shield, Star,
} from 'lucide-react-native'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { authApi } from '../../api/auth.api'
import { buyerTasksApi } from '../../api/tasks.api'
import { useAuthStore } from '../../stores/authStore'
import { formatMoney } from '../../utils/formatMoney'
import { AppHeader } from '../../components/layout/AppHeader'
import type { BuyerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<BuyerStackParamList>

export function BuyerDashboardScreen() {
  const navigation = useNavigation<Nav>()
  const { user, logout } = useAuthStore()

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    staleTime: 60_000,
  })

  const tasksQuery = useQuery({
    queryKey: ['buyer-tasks-all'],
    queryFn: () => buyerTasksApi.listTasks({ page: 1, limit: 100 }),
    staleTime: 30_000,
  })

  const profile = meQuery.data?.buyerProfile
  const allTasks = tasksQuery.data?.tasks ?? []
  const totalSpent = profile?.totalSpentCents ?? 0
  const totalPosted = profile?.totalTasksPosted ?? allTasks.length
  const activeTasks = allTasks.filter(t =>
    ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'].includes(t.status)
  ).length
  const completedTasks = allTasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED').length

  const initials = (user?.name ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const colors = [B.primary, '#3B82F6', '#8B5CF6', B.secondary, '#EC4899', '#06B6D4']
  const colorIdx = (user?.name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  const avatarColor = colors[colorIdx]

  const handleLogout = () => {
    logout()
  }

  const loading = meQuery.isLoading || tasksQuery.isLoading

  return (
    <View style={s.root}>
      <AppHeader title="Dashboard" onNotificationPress={() => navigation.navigate('Notifications' as any)} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => { meQuery.refetch(); tasksQuery.refetch() }}
            tintColor={B.primary}
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
              <Text style={s.roleText}>Buyer</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        {loading ? (
          <ActivityIndicator color={B.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={s.statsRow}>
            <StatCard label="Posted" value={`${totalPosted}`} icon={<ClipboardList size={18} color={B.primary} />} color={B.tint.blue} />
            <StatCard label="Active" value={`${activeTasks}`} icon={<Star size={18} color={B.secondary} />} color={B.tint.gold} />
            <StatCard label="Done" value={`${completedTasks}`} icon={<Shield size={18} color={B.status.success} />} color={B.tint.green} />
            <StatCard label="Spent" value={formatMoney(totalSpent, 'INR')} icon={<Wallet size={18} color="#8B5CF6" />} color={B.tint.purple} />
          </View>
        )}

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate('BuyerTabs', { screen: 'PostTask' } as any)} activeOpacity={0.85}>
            <View style={[s.actionIcon, { backgroundColor: B.primaryTint }]}>
              <ClipboardList size={22} color={B.primary} />
            </View>
            <Text style={s.actionLabel}>Post Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionCard} onPress={() => navigation.navigate('BuyerTabs', { screen: 'BuyerTasks' } as any)} activeOpacity={0.85}>
            <View style={[s.actionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Star size={22} color="#F59E0B" />
            </View>
            <Text style={s.actionLabel}>My Tasks</Text>
          </TouchableOpacity>
        </View>

        {/* Menu */}
        <Text style={s.sectionTitle}>Account</Text>
        <View style={s.menuCard}>
          <MenuItem icon={<User size={18} color={B.text.secondary} />} label="Edit Profile" onPress={() => {}} />
          <MenuItem icon={<Settings size={18} color={B.text.secondary} />} label="Settings" onPress={() => {}} />
          <MenuItem icon={<HelpCircle size={18} color={B.text.secondary} />} label="Help & Support" onPress={() => {}} />
          <MenuItem icon={<LogOut size={18} color={B.status.error} />} label="Logout" onPress={handleLogout} danger />
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
      <Text style={[s.menuLabel, danger && { color: B.status.error }]}>{label}</Text>
      <ChevronRight size={16} color={B.text.muted} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: B.background },
  scroll:       { flex: 1 },
  content:      { padding: 20, paddingTop: 16 },

  // Profile
  profileCard:  { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: B.surface, borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: B.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
  avatarLg:     { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  profileInfo:  { flex: 1 },
  profileName:  { fontSize: 18, fontWeight: '800', color: B.text.primary },
  profileEmail: { fontSize: 13, color: B.text.muted, marginTop: 2 },
  roleBadge:    { alignSelf: 'flex-start', backgroundColor: B.primaryTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  roleText:     { fontSize: 11, fontWeight: '700', color: B.primary },

  // Stats
  statsRow:     { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statCard:     { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
  statValue:    { fontSize: 16, fontWeight: '800', color: B.text.primary },
  statLabel:    { fontSize: 10, fontWeight: '600', color: B.text.secondary },

  // Section
  sectionTitle: { fontSize: 15, fontWeight: '700', color: B.text.primary, marginBottom: 10 },

  // Quick actions
  actionsRow:   { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionCard:   { flex: 1, backgroundColor: B.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: B.border },
  actionIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { fontSize: 13, fontWeight: '700', color: B.text.primary },

  // Menu
  menuCard:     { backgroundColor: B.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: B.border },
  menuItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: B.divider },
  menuLabel:    { flex: 1, fontSize: 14, fontWeight: '600', color: B.text.primary },
})
