import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Input } from '../../components/ui/Input'
import { authApi } from '../../api/auth.api'
import { saveTokens } from '../../stores/authStore'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { requestPushPermission } from '../../utils/permissions'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>
}

// Neutral blue — not buyer rose or worker green
const ACCENT = '#3B82F6'
const ACCENT_BG = '#EFF6FF'

export function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const insets = useSafeAreaInsets()

  const { setUser } = useAuthStore()
  const { connect } = useSocketStore()

  const handleLogin = async () => {
    setError(null)
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.login(email.trim().toLowerCase(), password)
      await saveTokens({
        accessToken:  res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn:    res.expiresIn,
      })
      setUser(res.user)
      connect(res.accessToken)
      const expoPushToken = await requestPushPermission()
      if (expoPushToken) {
        authApi.saveDeviceToken(expoPushToken).catch(() => {})
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'Invalid email or password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 40 }]}>
          <View style={s.logoMark}>
            <Text style={s.logoE}>e</Text>
          </View>
          <Text style={s.headerTitle}>Welcome back</Text>
          <Text style={s.headerSub}>Sign in to your eClean account</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
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
            autoCapitalize="none"
          />
          <Input
            label="Password"
            placeholder="Your password"
            secure
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={s.forgotBtn}
          >
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.ctaBtn, loading && s.ctaBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.ctaText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={s.switchLink}>Create one</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flexGrow: 1 },

  header: { paddingHorizontal: 28, paddingBottom: 36, alignItems: 'center' },
  logoMark: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 20,
  },
  logoE:       { fontSize: 32, fontWeight: '900', color: '#fff' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headerSub:   { fontSize: 15, color: 'rgba(255,255,255,0.45)', marginTop: 6 },

  form: {
    flex: 1, padding: 28,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },

  errorBox:  { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500' },

  forgotBtn:  { alignSelf: 'flex-end', marginBottom: 24, marginTop: -8 },
  forgotText: { color: ACCENT, fontSize: 14, fontWeight: '600' },

  ctaBtn: {
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 18, alignItems: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },

  switchRow:   { flexDirection: 'row', justifyContent: 'center' },
  switchLabel: { color: '#64748B', fontSize: 15 },
  switchLink:  { color: ACCENT, fontSize: 15, fontWeight: '700' },
})
