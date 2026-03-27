import React from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react-native'
import { ScreenWrapper }       from '../../components/layout/ScreenWrapper'
import { COLORS }              from '../../constants/colors'
import { notificationsApi }    from '../../api/notifications.api'
import { timeAgo }             from '../../utils/timeAgo'

export function NotificationsScreen() {
  const qc = useQueryClient()

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
                onPress={() => { if (!n.isRead) markOneMutation.mutate(n.id) }}
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
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
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
