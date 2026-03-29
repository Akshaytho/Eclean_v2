import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Input } from '../../components/ui/Input'
import { authApi } from '../../api/auth.api'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>
}

const ACCENT = '#3B82F6'

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const insets = useSafeAreaInsets()

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
      setSent(true) // Always show success to prevent email enumeration
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={s.form}>
        {sent ? (
          <View style={s.successBox}>
            <View style={s.successIcon}>
              <Text style={s.successIconText}>✓</Text>
            </View>
            <Text style={s.successTitle}>Check your email</Text>
            <Text style={s.successBody}>
              If an account exists for {email}, you'll receive a password reset link shortly.
            </Text>
            <TouchableOpacity style={s.ctaBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
              <Text style={s.ctaText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.title}>Forgot Password?</Text>
            <Text style={s.subtitle}>No worries. Enter your email and we'll send you a reset link.</Text>

            {error && (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <Input
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <TouchableOpacity
              style={[s.ctaBtn, loading && s.ctaBtnDisabled]}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={s.ctaText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },

  header:  { paddingHorizontal: 24 },
  backBtn: { paddingVertical: 12 },
  backText:{ color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '500' },

  form: {
    flex: 1, padding: 28, marginTop: 8,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },

  title:    { fontSize: 26, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#64748B', marginBottom: 28, lineHeight: 22 },

  errorBox:  { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500' },

  ctaBtn: {
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  successBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  successIcon:     { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successIconText: { fontSize: 28, color: '#10B981' },
  successTitle:    { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  successBody:     { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
})
