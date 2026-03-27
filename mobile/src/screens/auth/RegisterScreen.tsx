import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authApi } from '../../api/auth.api'
import { saveTokens } from '../../stores/authStore'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { requestPushPermission } from '../../utils/permissions'
import { COLORS } from '../../constants/colors'
import type { Role } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>
}

const ROLE_OPTIONS: { role: Extract<Role, 'WORKER' | 'BUYER' | 'CITIZEN'>; emoji: string; title: string; desc: string }[] = [
  { role: 'WORKER',  emoji: '🧹', title: 'Worker',  desc: 'Find cleaning tasks & earn' },
  { role: 'BUYER',   emoji: '🏢', title: 'Buyer',   desc: 'Post tasks, track progress' },
  { role: 'CITIZEN', emoji: '📍', title: 'Citizen', desc: 'Report dirty areas near you' },
]

export function RegisterScreen({ navigation }: Props) {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'WORKER' | 'BUYER' | 'CITIZEN'>('WORKER')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const { setUser } = useAuthStore()
  const { connect } = useSocketStore()

  const handleRegister = async () => {
    setError(null)
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={styles.header}>
          <Text style={styles.headerLogo}>eClean</Text>
          <Text style={styles.headerSub}>Create your account</Text>
        </LinearGradient>

        <View style={styles.form}>
          <Text style={styles.title}>Register</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Role selector */}
          <Text style={styles.roleLabel}>I want to...</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.role}
                style={[styles.roleCard, role === opt.role && styles.roleCardActive]}
                onPress={() => setRole(opt.role)}
                activeOpacity={0.8}
              >
                <Text style={styles.roleEmoji}>{opt.emoji}</Text>
                <Text style={[styles.roleTitle, role === opt.role && styles.roleTitleActive]}>
                  {opt.title}
                </Text>
                <Text style={styles.roleDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Input
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Input
            label="Password"
            placeholder="Min. 8 characters, 1 uppercase, 1 digit"
            secure
            value={password}
            onChangeText={setPassword}
          />

          <Button
            label="Create Account"
            onPress={handleRegister}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.registerBtn}
          />

          <View style={styles.loginRow}>
            <Text style={styles.loginLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerLogo: { fontSize: 36, fontWeight: '800', color: '#fff' },
  headerSub:  { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  form: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 16 },
  errorBox: { backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: COLORS.status.error, fontSize: 14 },
  roleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.neutral[700], marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.neutral[200],
    backgroundColor: COLORS.neutral[50],
  },
  roleCardActive: {
    borderColor: COLORS.brand.primary,
    backgroundColor: '#EFF6FF',
  },
  roleEmoji:  { fontSize: 28, marginBottom: 4 },
  roleTitle:  { fontSize: 13, fontWeight: '700', color: COLORS.neutral[700] },
  roleTitleActive: { color: COLORS.brand.primary },
  roleDesc:   { fontSize: 10, color: COLORS.neutral[500], textAlign: 'center', marginTop: 2 },
  registerBtn: { marginTop: 8, marginBottom: 24 },
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginLabel: { color: COLORS.neutral[500], fontSize: 14 },
  loginLink: { color: COLORS.brand.primary, fontSize: 14, fontWeight: '600' },
})
