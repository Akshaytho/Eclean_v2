import React from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bell, CheckCheck, ChevronRight } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { ScreenWrapper }       from '../../components/layout/ScreenWrapper'
import { COLORS }              from '../../constants/colors'
import { notificationsApi }    from '../../api/notifications.api'
import { useAuthStore }        from '../../stores/authStore'
import { timeAgo }             from '../../utils/timeAgo'

export function NotificationsScreen() {
  const navigation = useNavigation()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn:  () => notificationsApi.list(1),
    staleTime: 15_000,
  })

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const notifications = query.data?.notifications ?? []
  const unread        = query.data?.unreadCount ?? 0

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={12}>
          <ArrowLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={() => markAllMutation.mutate()} style={s.markAllBtn}>
            <CheckCheck size={16} color={COLORS.brand.primary} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {query.isLoading
        ? <ActivityIndicator color={COLORS.brand.primary} style={{ marginTop: 60 }} />
        : (
          <FlatList
            data={notifications}
            keyExtractor={n => n.id}
            refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} tintColor={COLORS.brand.primary} />}
            contentContainerStyle={{ paddingBottom: 80 }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Bell size={48} color={COLORS.neutral[300]} />
                <Text style={s.emptyText}>No notifications yet</Text>
              </View>
            }
            renderItem={({ item: n }) => (
              <TouchableOpacity
                style={[s.item, !n.isRead && s.itemUnread]}
                onPress={() => {
                  if (!n.isRead) markOneMutation.mutate(n.id)
                  // Navigate to relevant screen based on notification data and user role
                  const taskId = (n.data as any)?.taskId
                  if (taskId) {
                    const screen = role === 'WORKER' ? 'ActiveTask' : 'BuyerTaskDetail'
                    try { (navigation as any).navigate(screen, { taskId }) } catch {}
                  }
                }}
                activeOpacity={0.8}
              >
                {!n.isRead && <View style={s.unreadDot} />}
                <View style={s.itemContent}>
                  <Text style={s.itemTitle}>{n.title}</Text>
                  <Text style={s.itemBody}>{n.body}</Text>
                  <Text style={s.itemTime}>{timeAgo(n.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )
      }
    </ScreenWrapper>
  )
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 22, fontWeight: '700', color: COLORS.neutral[900] },
  markAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markAllText: { fontSize: 13, color: COLORS.brand.primary, fontWeight: '600' },
  item:        { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'flex-start', gap: 10 },
  itemUnread:  { backgroundColor: COLORS.brand.tint },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand.primary, marginTop: 5 },
  itemContent: { flex: 1 },
  itemTitle:   { fontSize: 14, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 2 },
  itemBody:    { fontSize: 13, color: COLORS.neutral[600], lineHeight: 20 },
  itemTime:    { fontSize: 11, color: COLORS.neutral[400], marginTop: 4 },
  empty:       { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:   { fontSize: 15, color: COLORS.neutral[500] },
})
