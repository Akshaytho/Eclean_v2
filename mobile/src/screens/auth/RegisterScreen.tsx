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
import type { Role } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>
}

const ACCENT = '#3B82F6'

const ROLE_OPTIONS: { role: Extract<Role, 'WORKER' | 'BUYER' | 'CITIZEN'>; icon: string; title: string; desc: string; color: string }[] = [
  { role: 'WORKER',  icon: '🧹', title: 'Worker',  desc: 'Clean & earn money', color: '#10B981' },
  { role: 'BUYER',   icon: '🏢', title: 'Buyer',   desc: 'Post cleaning tasks', color: '#3B82F6' },
  { role: 'CITIZEN', icon: '📍', title: 'Citizen', desc: 'Report dirty areas', color: '#8B5CF6' },
]

export function RegisterScreen({ navigation }: Props) {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'WORKER' | 'BUYER' | 'CITIZEN'>('WORKER')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const insets = useSafeAreaInsets()

  const { setUser } = useAuthStore()
  const { connect } = useSocketStore()

  const selectedRole = ROLE_OPTIONS.find(r => r.role === role)!

  const handleRegister = async () => {
    setError(null)
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password needs at least one uppercase letter and one number.')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      })
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
          ?.response?.data?.error?.message ?? 'Registration failed. Try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 28 }]}>
          <Text style={s.headerTitle}>Join eClean</Text>
          <Text style={s.headerSub}>Choose your role and get started</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Role selector — each role gets its own color */}
          <Text style={s.roleLabel}>I want to...</Text>
          <View style={s.roleRow}>
            {ROLE_OPTIONS.map((opt) => {
              const active = role === opt.role
              return (
                <TouchableOpacity
                  key={opt.role}
                  style={[s.roleCard, active && { borderColor: opt.color, backgroundColor: opt.color + '10' }]}
                  onPress={() => setRole(opt.role)}
                  activeOpacity={0.8}
                >
                  <Text style={s.roleIcon}>{opt.icon}</Text>
                  <Text style={[s.roleTitle, active && { color: opt.color }]}>{opt.title}</Text>
                  <Text style={s.roleDesc}>{opt.desc}</Text>
                  {active && <View style={[s.roleCheck, { backgroundColor: opt.color }]}><Text style={s.roleCheckText}>✓</Text></View>}
                </TouchableOpacity>
              )
            })}
          </View>

          <Input label="Full Name" placeholder="John Doe" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="Email" placeholder="you@example.com" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Input label="Password" placeholder="Min. 8 chars, 1 uppercase, 1 digit" secure value={password} onChangeText={setPassword} />

          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: selectedRole.color }, loading && s.ctaBtnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.ctaText}>{loading ? 'Creating...' : `Create ${selectedRole.title} Account`}</Text>
          </TouchableOpacity>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={s.switchLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flexGrow: 1 },

  header: { paddingHorizontal: 28, paddingBottom: 28 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headerSub:   { fontSize: 15, color: 'rgba(255,255,255,0.45)', marginTop: 6 },

  form: {
    flex: 1, padding: 28,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },

  errorBox:  { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '500' },

  roleLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  roleRow:   { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleCard:  {
    flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8,
    borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  roleIcon:  { fontSize: 32, marginBottom: 6 },
  roleTitle: { fontSize: 13, fontWeight: '800', color: '#475569' },
  roleDesc:  { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 3 },
  roleCheck: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleCheckText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  ctaBtn: {
    borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  switchRow:   { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  switchLabel: { color: '#64748B', fontSize: 15 },
  switchLink:  { color: ACCENT, fontSize: 15, fontWeight: '700' },
})
