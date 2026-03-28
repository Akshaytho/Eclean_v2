// Shared profile screen for all roles.
// Shows basic user info + logout. Full stats in Sprint 4.

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { LinearGradient } from '../../components/LinearGradientShim'
import { ScreenWrapper } from '../../components/layout/ScreenWrapper'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { COLORS } from '../../constants/colors'

export function ProfileScreen() {
  const { user, logout } = useAuthStore()
  const { disconnect } = useSocketStore()

  const handleLogout = async () => {
    disconnect()
    await logout()
    // RootNavigator detects isLoggedIn = false → navigates to Auth
  }

  const roleEmoji: Record<string, string> = {
    WORKER:     '🧹',
    BUYER:      '🏢',
    CITIZEN:    '📍',
    SUPERVISOR: '👷',
    ADMIN:      '⚙️',
  }

  return (
    <ScreenWrapper backgroundColor="#fff">
      <LinearGradient
        colors={[COLORS.brand.primary, COLORS.brand.dark]}
        style={styles.header}
      >
        <Text style={styles.avatar}>{roleEmoji[user?.role ?? 'WORKER']}</Text>
        <Text style={styles.name}>{user?.name ?? 'User'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role ?? ''}</Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Role</Text>
          <Text style={styles.infoValue}>{user?.role}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{user?.email}</Text>
        </View>

        <Text style={styles.comingSoon}>Full stats coming in Sprint 4</Text>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    alignItems: 'center',
  },
  avatar: { fontSize: 56, marginBottom: 12 },
  name:   { fontSize: 22, fontWeight: '700', color: '#fff' },
  email:  { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 10,
  },
  roleText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  body: { flex: 1, padding: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.neutral[400], letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.neutral[100] },
  infoLabel: { fontSize: 15, color: COLORS.neutral[600] },
  infoValue: { fontSize: 15, fontWeight: '500', color: COLORS.neutral[900] },
  comingSoon: { marginTop: 24, fontSize: 13, color: COLORS.neutral[400], textAlign: 'center' },
  logoutBtn: {
    marginTop: 32,
    backgroundColor: '#FFF0F0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: COLORS.status.error },
})
