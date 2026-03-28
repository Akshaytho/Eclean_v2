import React from 'react'
import {
  ScrollView,
  View,
  StyleSheet,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { COLORS } from '../../constants/colors'

interface ScreenWrapperProps {
  children:        React.ReactNode
  scroll?:         boolean
  style?:          ViewStyle
  contentStyle?:   ViewStyle
  statusBarStyle?: 'light' | 'dark' | 'auto'
  backgroundColor?: string
}

export function ScreenWrapper({
  children,
  scroll          = false,
  style,
  contentStyle,
  statusBarStyle  = 'dark',
  backgroundColor = COLORS.neutral[50],
}: ScreenWrapperProps) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }, style]}>
      <StatusBar style={statusBarStyle} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  fill:   { flex: 1 },
  scroll: { flexGrow: 1 },
})
