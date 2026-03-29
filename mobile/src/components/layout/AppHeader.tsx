import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bell } from 'lucide-react-native'
import { COLORS } from '../../constants/colors'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { useAuthStore } from '../../stores/authStore'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../../api/notifications.api'

interface AppHeaderProps {
  title?: string
  onNotificationPress?: () => void
  theme?: 'buyer' | 'worker'
}

export const AppHeader = React.memo(function AppHeader({ title = 'eClean', onNotificationPress, theme = 'buyer' }: AppHeaderProps) {
  const isBuyer = theme === 'buyer'
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()

  const { data } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => notificationsApi.list(1),
    staleTime: 30_000,
  })
  const unread = (data as any)?.unreadCount ?? 0

  const initials = (user?.name ?? '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const colors = ['#2E8B57', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4']
  const colorIdx = (user?.name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  const avatarColor = colors[colorIdx]

  // Consistent header height: safe area top + fixed 52px content area
  const topPad = insets.top > 0 ? insets.top : Platform.OS === 'android' ? 24 : 44

  return (
    <View style={[s.container, {
      paddingTop: topPad + 4,
      backgroundColor: isBuyer ? B.surface : W.surface,
      borderBottomColor: isBuyer ? B.border : W.border,
    }]}>
      {/* Logo / Title */}
      <View style={s.left}>
        <View style={[s.logoDot, { backgroundColor: isBuyer ? B.primary : W.primary }]} />
        <Text style={[s.title, { color: isBuyer ? B.text.primary : W.text.primary }]}>{title}</Text>
      </View>

      {/* Right actions */}
      <View style={s.right}>
        <TouchableOpacity
          style={[s.bellBtn, { backgroundColor: isBuyer ? B.primaryTint : W.primaryTint }]}
          onPress={onNotificationPress}
          activeOpacity={0.8}
        >
          <Bell size={20} color={isBuyer ? B.primary : W.primary} />
          {unread > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={[s.avatar, { backgroundColor: avatarColor }]}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
      </View>
    </View>
  )
})

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  left:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoDot:   { width: 10, height: 10, borderRadius: 5 },
  title:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  right:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bellBtn:   { position: 'relative', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge:     { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:{ color: '#fff', fontSize: 13, fontWeight: '800' },
})
