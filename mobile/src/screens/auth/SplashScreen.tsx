// SplashScreen — shown on cold start while we check stored tokens.
// If tokens exist → fetch /auth/me → navigate to role tabs.
// If no tokens   → navigate to Onboarding.
// Never shows the login screen for already-authenticated users.

import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { getTokens } from '../../stores/authStore'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { authApi } from '../../api/auth.api'
import { COLORS } from '../../constants/colors'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>
}

export function SplashScreen({ navigation }: Props) {
  const { setUser, setLoading } = useAuthStore()
  const { connect } = useSocketStore()

  useEffect(() => {
    async function checkAuth() {
      try {
        const { accessToken } = await getTokens()

        if (!accessToken) {
          navigation.replace('Onboarding')
          return
        }

        const user = await authApi.me()
        setUser(user)
        connect(accessToken)
        // RootNavigator watches isLoggedIn and re-routes automatically
      } catch {
        setLoading(false)
        navigation.replace('Onboarding')
      }
    }

    checkAuth()
  }, [])

  return (
    <LinearGradient
      colors={[COLORS.brand.primary, COLORS.brand.dark]}
      style={styles.container}
    >
      <Text style={styles.logo}>eClean</Text>
      <Text style={styles.tagline}>Clean cities. Real work. Instant pay.</Text>
      <ActivityIndicator color="#fff" style={styles.spinner} />
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  logo: {
    fontSize:   48,
    fontWeight: '800',
    color:      '#fff',
    letterSpacing: -1,
  },
  tagline: {
    fontSize:   16,
    color:      'rgba(255,255,255,0.8)',
    marginTop:  8,
    textAlign:  'center',
  },
  spinner: {
    marginTop: 48,
  },
})
