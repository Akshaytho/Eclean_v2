import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ScreenWrapper }  from '../../components/layout/ScreenWrapper'
import { StatusBadge }    from '../../components/ui/Badge'
import { COLORS }         from '../../constants/colors'
import { buyerTasksApi }  from '../../api/tasks.api'
import { formatMoney }    from '../../utils/formatMoney'
import { timeAgo }        from '../../utils/timeAgo'
import type { Task }      from '../../types'
import type { BuyerStackParamList } from '../../navigation/types'

type Nav = NativeStackNavigationProp<BuyerStackParamList>

const TABS = [
  { label: 'Active',    status: 'OPEN,ACCEPTED,IN_PROGRESS' },
  { label: 'Review',   status: 'SUBMITTED,VERIFIED' },
  { label: 'Done',     status: 'APPROVED,COMPLETED,REJECTED,CANCELLED' },
]

export function BuyerTasksScreen() {
  const navigation = useNavigation<Nav>()
  const [tab, setTab] = useState(0)

  const query = useQuery({
    queryKey: ['buyer-tasks', tab],
    queryFn:  () => buyerTasksApi.listTasks({ status: TABS[tab].status, page: 1, limit: 50 }),
    staleTime: 15_000,
  })

  const tasks = query.data?.tasks ?? []

  return (
    <ScreenWrapper>
      <View style={s.tabs}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t.label} style={[s.tab, i === tab && s.tabActive]} onPress={() => setTab(i)}>
            <Text style={[s.tabText, i === tab && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {query.isLoading
        ? <ActivityIndicator color={COLORS.brand.primary} style={{ marginTop: 60 }} />
        : (
          <FlatList
            data={tasks}
            keyExtractor={t => t.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={query.refetch} tintColor={COLORS.brand.primary} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyText}>No tasks here yet</Text>
              </View>
            }
            renderItem={({ item: task }) => (
              <TouchableOpacity
                style={[s.card, task.status === 'SUBMITTED' && s.cardUrgent]}
                onPress={() => navigation.navigate('BuyerTaskDetail', { taskId: task.id })}
                activeOpacity={0.8}
              >
                <View style={s.cardTop}>
                  <Text style={s.title} numberOfLines={1}>{task.title}</Text>
                  <StatusBadge status={task.status} small />
                </View>
                <View style={s.cardMeta}>
                  <Text style={s.price}>{formatMoney(task.rateCents)}</Text>
                  <Text style={s.time}>{timeAgo(task.updatedAt)}</Text>
                </View>
                {task.aiScore != null && (
                  <Text style={s.aiScore}>AI Score: {task.aiScore}%</Text>
                )}
                {task.status === 'SUBMITTED' && (
                  <Text style={s.urgent}>⚡ Tap to review and approve</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )
      }
    </ScreenWrapper>
  )
}

const s = StyleSheet.create({
  tabs:        { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  tab:         { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.neutral[100], alignItems: 'center' },
  tabActive:   { backgroundColor: COLORS.brand.primary },
  tabText:     { fontSize: 13, fontWeight: '600', color: COLORS.neutral[600] },
  tabTextActive:{ color: '#fff' },
  card:        { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardUrgent:  { borderColor: '#D97706', borderWidth: 2 },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  title:       { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.neutral[900], marginRight: 8 },
  cardMeta:    { flexDirection: 'row', justifyContent: 'space-between' },
  price:       { fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  time:        { fontSize: 12, color: COLORS.neutral[400] },
  aiScore:     { fontSize: 12, color: COLORS.brand.primary, fontWeight: '600', marginTop: 6 },
  urgent:      { fontSize: 12, color: '#D97706', fontWeight: '600', marginTop: 6 },
  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyText:   { fontSize: 15, color: COLORS.neutral[500] },
})
