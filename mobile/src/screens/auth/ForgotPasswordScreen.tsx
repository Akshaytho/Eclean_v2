import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authApi } from '../../api/auth.api'
import { COLORS } from '../../constants/colors'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>
}

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSend = async () => {
    setError(null)
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase())
      setSent(true)
    } catch {
      // Always show success to avoid email enumeration
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
      </LinearGradient>

      <View style={styles.form}>
        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successEmoji}>📧</Text>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successBody}>
              If an account exists for {email}, you'll receive a reset link shortly.
            </Text>
            <Button
              label="Back to Login"
              onPress={() => navigation.navigate('Login')}
              fullWidth
              style={styles.backBtn}
            />
          </View>
        ) : (
          <>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a link to reset your password.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Button
              label="Send Reset Link"
              onPress={handleSend}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.sendBtn}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 24,
  },
  back: { marginBottom: 16 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#fff' },
  form: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 8 },
  subtitle: { fontSize: 15, color: COLORS.neutral[500], marginBottom: 24, lineHeight: 22 },
  errorBox: { backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: COLORS.status.error, fontSize: 14 },
  sendBtn: { marginTop: 8 },
  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 12 },
  successBody: { fontSize: 15, color: COLORS.neutral[500], textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  backBtn: {},
})
