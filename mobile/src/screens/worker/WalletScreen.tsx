// Sprint 2 screen — placeholder
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ScreenWrapper } from '../../components/layout/ScreenWrapper'
import { COLORS } from '../../constants/colors'

export function WalletScreen() {
  return (
    <ScreenWrapper>
      <View style={styles.center}>
        <Text style={styles.emoji}>💰</Text>
        <Text style={styles.title}>Wallet</Text>
        <Text style={styles.sub}>Earnings + payouts — Sprint 2</Text>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emoji:  { fontSize: 56, marginBottom: 12 },
  title:  { fontSize: 22, fontWeight: '700', color: COLORS.neutral[900] },
  sub:    { fontSize: 14, color: COLORS.neutral[400], marginTop: 6 },
})
