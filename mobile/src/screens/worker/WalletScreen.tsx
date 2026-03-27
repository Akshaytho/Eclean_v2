import React from 'react'
import {
  View, Text, StyleSheet,
  FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock, XCircle, ArrowDownLeft } from 'lucide-react-native'

import { COLORS } from '../../constants/colors'
import { payoutsApi } from '../../api/payouts.api'
import type { PayoutListItem } from '../../api/payouts.api'
import { formatMoney } from '../../utils/formatMoney'
import { timeAgo } from '../../utils/timeAgo'
import type { PayoutStatus } from '../../types'

const STATUS_COLOR: Record<PayoutStatus, string> = {
  PENDING:    COLORS.status.warning,
  PROCESSING: COLORS.status.info,
  COMPLETED:  COLORS.status.success,
  FAILED:     COLORS.status.error,
}

const STATUS_LABEL: Record<PayoutStatus, string> = {
  PENDING:    'Pending',
  PROCESSING: 'Processing',
  COMPLETED:  'Paid Out',
  FAILED:     'Failed',
}

export function WalletScreen() {
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['worker', 'wallet'],
    queryFn:  payoutsApi.getWallet,
    staleTime: 30_000,
  })

  const { data: payoutsData, isLoading: payoutsLoading, refetch } = useQuery({
    queryKey: ['worker', 'payouts', 1],
    queryFn:  () => payoutsApi.getPayouts(1),
    staleTime: 30_000,
  })

  const payouts = payoutsData?.payouts ?? []

  return (
    <View style={styles.container}>
      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={[COLORS.brand.dark, COLORS.brand.primary]}
        style={styles.header}
      >
        <Text style={styles.headerLabel}>Total Earned</Text>
        {walletLoading ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} />
        ) : (
          <Text style={styles.totalEarned}>
            {formatMoney(wallet?.totalEarnedCents ?? 0, 'INR')}
          </Text>
        )}

        <View style={styles.summaryRow}>
          <SummaryCard
            label="Available"
            amount={wallet?.availableCents ?? 0}
            color="#fff"
          />
          <SummaryCard
            label="Pending"
            amount={wallet?.pendingCents ?? 0}
            color="rgba(255,255,255,0.75)"
          />
          <SummaryCard
            label="Processing"
            amount={wallet?.processingCents ?? 0}
            color="rgba(255,255,255,0.75)"
          />
        </View>

        {/* Withdraw coming soon */}
        <TouchableOpacity style={styles.withdrawBtn} disabled activeOpacity={0.8}>
          <ArrowDownLeft size={16} color={COLORS.neutral[500]} style={{ marginRight: 6 }} />
          <Text style={styles.withdrawText}>Withdraw — Coming Soon</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Payout History ── */}
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Payout History</Text>
        <Text style={styles.historyCount}>
          {payoutsData?.total ? `${payoutsData.total} total` : ''}
        </Text>
      </View>

      {payoutsLoading ? (
        <ActivityIndicator color={COLORS.brand.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={payoutsLoading}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <CheckCircle size={40} color={COLORS.neutral[300]} />
              <Text style={styles.emptyText}>No payouts yet</Text>
              <Text style={styles.emptySubtext}>Complete tasks to earn money</Text>
            </View>
          }
          renderItem={({ item }) => <PayoutRow payout={item} />}
        />
      )}
    </View>
  )
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryAmount, { color }]}>{formatMoney(amount, 'INR')}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function PayoutRow({ payout }: { payout: PayoutListItem }) {
  const color = STATUS_COLOR[payout.status]
  const label = STATUS_LABEL[payout.status]

  return (
    <View style={styles.payoutCard}>
      <View style={styles.payoutLeft}>
        <Text style={styles.payoutTask} numberOfLines={1}>{payout.taskTitle}</Text>
        <Text style={styles.payoutBuyer}>From {payout.buyerName}</Text>
        <Text style={styles.payoutDate}>{timeAgo(payout.createdAt)}</Text>
      </View>
      <View style={styles.payoutRight}>
        <Text style={styles.payoutAmount}>{formatMoney(payout.workerAmountCents, 'INR')}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.background },
  header:        { paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 },
  headerLabel:   { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  totalEarned:   { fontSize: 38, fontWeight: '800', color: '#fff', marginVertical: 4 },
  summaryRow:    { flexDirection: 'row', marginTop: 16, gap: 8 },
  summaryCard:   { flex: 1, alignItems: 'center' },
  summaryAmount: { fontSize: 15, fontWeight: '700' },
  summaryLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  withdrawBtn:   {
    marginTop: 16,
    backgroundColor: COLORS.neutral[200],
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawText:  { fontSize: 14, fontWeight: '600', color: COLORS.neutral[500] },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  historyTitle:  { fontSize: 16, fontWeight: '700', color: COLORS.neutral[900] },
  historyCount:  { fontSize: 13, color: COLORS.neutral[400] },
  list:          { padding: 16, paddingBottom: 40 },
  empty:         { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText:     { fontSize: 15, fontWeight: '600', color: COLORS.neutral[600] },
  emptySubtext:  { fontSize: 13, color: COLORS.neutral[400] },
  payoutCard:    {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  payoutLeft:    { flex: 1 },
  payoutTask:    { fontSize: 14, fontWeight: '600', color: COLORS.neutral[900], marginBottom: 3 },
  payoutBuyer:   { fontSize: 12, color: COLORS.neutral[500], marginBottom: 2 },
  payoutDate:    { fontSize: 11, color: COLORS.neutral[400] },
  payoutRight:   { alignItems: 'flex-end', gap: 6 },
  payoutAmount:  { fontSize: 17, fontWeight: '800', color: COLORS.brand.primary },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText:    { fontSize: 11, fontWeight: '700' },
})
