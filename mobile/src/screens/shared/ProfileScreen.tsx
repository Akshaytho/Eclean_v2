/**
 * ProfileScreen — real stats for all 5 roles
 * Backend: GET /api/v1/auth/me
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Star, CheckCircle, Wallet, ClipboardList, MapPin, LogOut, Shield, User, Mail } from 'lucide-react-native'
import { LinearGradient }  from '../../components/LinearGradientShim'
import { ScreenWrapper }   from '../../components/layout/ScreenWrapper'
import { Skeleton }        from '../../components/ui/Skeleton'
import { authApi }         from '../../api/auth.api'
import { useAuthStore }    from '../../stores/authStore'
import { useSocketStore }  from '../../stores/socketStore'
import { formatMoney }     from '../../utils/formatMoney'
import { COLORS }          from '../../constants/colors'

const ROLE_GRADIENTS: Record<string, string[]> = {
  WORKER:     ['#1A5C3A', '#2E8B57'],
  BUYER:      ['#061740', '#0A2463'],
  SUPERVISOR: ['#1E3A5F', '#2563EB'],
  CITIZEN:    ['#4A1D96', '#7C3AED'],
  ADMIN:      ['#1F2937', '#374151'],
}

const ROLE_LABELS: Record<string, string> = {
  WORKER:     'Field Worker',
  BUYER:      'Task Buyer',
  SUPERVISOR: 'Zone Supervisor',
  CITIZEN:    'Citizen Reporter',
  ADMIN:      'Administrator',
}

export function ProfileScreen() {
  const { user, logout }   = useAuthStore()
  const { disconnect }     = useSocketStore()
  const [loggingOut, setLoggingOut] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey:  ['me'],
    queryFn:   authApi.me,
    staleTime: 60_000,
  })

  const role   = user?.role ?? 'WORKER'
  const colors = ROLE_GRADIENTS[role] ?? ROLE_GRADIENTS.WORKER
  const wp     = (profile as any)?.workerProfile
  const bp     = (profile as any)?.buyerProfile
  const stats  = buildStats(role, wp, bp)
  const initials = (user?.name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          setLoggingOut(true)
          try {
            disconnect()
            await logout()
          } catch {
            setLoggingOut(false)
          }
        }
      },
    ])
  }

  return (
    <ScreenWrapper backgroundColor={COLORS.background}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Gradient header */}
        <LinearGradient colors={colors as any} style={s.header}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.name}>{user?.name ?? 'User'}</Text>
          <Text style={s.email}>{user?.email ?? ''}</Text>
          <View style={s.roleBadge}>
            <Shield size={12} color="rgba(255,255,255,0.9)" />
            <Text style={s.roleText}>{ROLE_LABELS[role] ?? role}</Text>
          </View>
        </LinearGradient>

        {/* Stats grid */}
        {stats.length > 0 && (
          <View style={s.statsGrid}>
            {isLoading
              ? Array(2).fill(0).map((_, i) => (
                  <View key={i} style={s.statCard}>
                    <Skeleton width={40} height={28} borderRadius={6} style={{ marginBottom: 6 }} />
                    <Skeleton width={60} height={12} borderRadius={4} />
                  </View>
                ))
              : stats.map((stat, i) => (
                  <View key={i} style={s.statCard}>
                    <View style={[s.statIconWrap, { backgroundColor: stat.color + '18' }]}>
                      {stat.icon}
                    </View>
                    <Text style={s.statValue}>{stat.value}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </View>
                ))
            }
          </View>
        )}

        {/* Account info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          <View style={s.card}>
            <View style={s.infoRow}>
              <User size={16} color={COLORS.neutral[400]} />
              <Text style={s.infoLabel}>Full Name</Text>
              <Text style={s.infoValue}>{user?.name ?? '—'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.infoRow}>
              <Mail size={16} color={COLORS.neutral[400]} />
              <Text style={s.infoLabel}>Email</Text>
              <Text style={s.infoValue} numberOfLines={1}>{user?.email ?? '—'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.infoRow}>
              <Shield size={16} color={COLORS.neutral[400]} />
              <Text style={s.infoLabel}>Role</Text>
              <Text style={s.infoValue}>{ROLE_LABELS[role] ?? role}</Text>
            </View>
          </View>
        </View>

        {/* Worker rating bar */}
        {role === 'WORKER' && !isLoading && wp && wp.rating > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Performance</Text>
            <View style={s.card}>
              <View style={s.ratingRow}>
                <Star size={18} color="#F59E0B" fill="#F59E0B" />
                <Text style={s.ratingNum}>{wp.rating.toFixed(1)}</Text>
                <Text style={s.ratingLabel}>Average Rating</Text>
              </View>
              <View style={s.ratingBar}>
                <View style={[s.ratingFill, { width: `${(wp.rating / 5) * 100}%` as any }]} />
              </View>
              <Text style={s.ratingHint}>
                {wp.completedTasks} task{wp.completedTasks !== 1 ? 's' : ''} completed
                {wp.identityVerified ? ' · ✓ Verified' : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Sign out */}
        <View style={s.section}>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut} activeOpacity={0.85}>
            {loggingOut
              ? <ActivityIndicator color={COLORS.status.error} size="small" />
              : <><LogOut size={18} color={COLORS.status.error} /><Text style={s.logoutText}>Sign Out</Text></>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenWrapper>
  )
}

function buildStats(role: string, wp: any, bp: any) {
  if (role === 'WORKER') return [
    { label: 'Completed',  value: String(wp?.completedTasks ?? 0), icon: <CheckCircle size={18} color="#2E8B57" />, color: '#2E8B57' },
    { label: 'Rating',     value: wp?.rating > 0 ? `${wp.rating.toFixed(1)}★` : '—', icon: <Star size={18} color="#F59E0B" />, color: '#F59E0B' },
  ]
  if (role === 'BUYER') return [
    { label: 'Tasks Posted', value: String(bp?.totalTasksPosted ?? 0), icon: <ClipboardList size={18} color="#0A2463" />, color: '#0A2463' },
    { label: 'Total Spent',  value: bp?.totalSpentCents ? formatMoney(bp.totalSpentCents) : '₹0', icon: <Wallet size={18} color="#D4A843" />, color: '#D4A843' },
  ]
  return []
}

const s = StyleSheet.create({
  header:       { paddingTop: 64, paddingBottom: 36, alignItems: 'center', paddingHorizontal: 24 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  avatarText:   { fontSize: 30, fontWeight: '800', color: '#fff' },
  name:         { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  email:        { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 12 },
  roleBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  roleText:     { color: '#fff', fontWeight: '600', fontSize: 12 },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  statCard:     { flex: 1, minWidth: '42%', backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, alignItems: 'center', elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  statIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue:    { fontSize: 22, fontWeight: '800', color: COLORS.neutral[900], marginBottom: 4 },
  statLabel:    { fontSize: 11, color: COLORS.neutral[400], fontWeight: '600', textAlign: 'center' },
  section:      { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.neutral[400], letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  card:         { backgroundColor: COLORS.surface, borderRadius: 16, paddingHorizontal: 16, elevation: 2, shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  infoLabel:    { fontSize: 14, color: COLORS.neutral[500], flex: 1 },
  infoValue:    { fontSize: 14, fontWeight: '600', color: COLORS.neutral[900], flex: 2, textAlign: 'right' },
  divider:      { height: 1, backgroundColor: COLORS.neutral[100], marginLeft: 44 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  ratingNum:    { fontSize: 22, fontWeight: '800', color: COLORS.neutral[900] },
  ratingLabel:  { fontSize: 13, color: COLORS.neutral[400], flex: 1 },
  ratingBar:    { height: 6, backgroundColor: COLORS.neutral[100], borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
  ratingFill:   { height: 6, backgroundColor: '#F59E0B', borderRadius: 3 },
  ratingHint:   { fontSize: 12, color: COLORS.neutral[400], paddingBottom: 14 },
  logoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF0F0', borderRadius: 14, padding: 16 },
  logoutText:   { fontSize: 15, fontWeight: '700', color: COLORS.status.error },
})
