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
import { LinearGradient } from '../../components/LinearGradientShim'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { authApi } from '../../api/auth.api'
import { saveTokens } from '../../stores/authStore'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { requestPushPermission } from '../../utils/permissions'
import { toast } from '../../stores/toastStore'
import { COLORS } from '../../constants/colors'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>
}

export function LoginScreen({ navigation }: Props) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

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

      // Request push permission after login — improves opt-in rate
      const expoPushToken = await requestPushPermission()
      if (expoPushToken) {
        authApi.saveDeviceToken(expoPushToken).catch(() => {})
      }

      // RootNavigator watches isLoggedIn → automatically navigates to role tabs
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
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={styles.header}>
          <Text style={styles.headerLogo}>eClean</Text>
          <Text style={styles.headerSub}>Welcome back</Text>
        </LinearGradient>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Sign In</Text>

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
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.loginBtn}
          />

          <View style={styles.registerRow}>
            <Text style={styles.registerLabel}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Register</Text>
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
    paddingTop:    80,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerLogo: { fontSize: 40, fontWeight: '800', color: '#fff' },
  headerSub:  { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 6 },
  form: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
  },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 20 },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: COLORS.status.error, fontSize: 14 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -8 },
  forgotText: { color: COLORS.brand.primary, fontSize: 14 },
  loginBtn: { marginBottom: 24 },
  registerRow: { flexDirection: 'row', justifyContent: 'center' },
  registerLabel: { color: COLORS.neutral[500], fontSize: 14 },
  registerLink: { color: COLORS.brand.primary, fontSize: 14, fontWeight: '600' },
})
