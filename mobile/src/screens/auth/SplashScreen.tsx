// SplashScreen — shown on cold start while we check stored tokens.
// If tokens exist → fetch /auth/me → navigate to role tabs.
// If no tokens   → navigate to Onboarding.

import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { getTokens } from '../../stores/authStore'
import { useAuthStore } from '../../stores/authStore'
import { useSocketStore } from '../../stores/socketStore'
import { authApi } from '../../api/auth.api'

const { width: SW, height: SH } = Dimensions.get('window')

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Splash'>
}

export function SplashScreen({ navigation }: Props) {
  const { setUser, setLoading } = useAuthStore()
  const { connect } = useSocketStore()

  const logoScale = useRef(new Animated.Value(0.5)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const textTranslate = useRef(new Animated.Value(16)).current
  const shimmerOpacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    // Logo pop in
    const logoAnim = Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 50, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ])
    logoAnim.start()

    // Text slide up (delayed)
    const textTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(textTranslate, { toValue: 0, friction: 8, useNativeDriver: true }),
      ]).start()
    }, 300)

    // Shimmer pulse
    const shimmerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmerOpacity, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    )
    shimmerAnim.start()

    return () => {
      clearTimeout(textTimer)
      logoAnim.stop()
      shimmerAnim.stop()
    }
  }, [])

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
      } catch {
        setLoading(false)
        navigation.replace('Onboarding')
      }
    }
    checkAuth()
  }, [])

  return (
    <View style={s.container}>
      {/* Subtle background glow */}
      <View style={s.glowTop} />
      <View style={s.glowBottom} />

      {/* Logo mark */}
      <Animated.View style={[s.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={s.logoCircle}>
          <Text style={s.logoE}>e</Text>
        </View>
      </Animated.View>

      {/* Brand name */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslate }] }}>
        <Text style={s.brand}>eClean</Text>
        <Text style={s.tagline}>Clean cities. Verified work.</Text>
      </Animated.View>

      {/* Loading bar */}
      <Animated.View style={[s.loadBar, { opacity: shimmerOpacity }]}>
        <View style={s.loadBarFill} />
      </Animated.View>

      {/* Bottom */}
      <View style={s.bottom}>
        <Text style={s.bottomText}>AI-Powered Civic Platform</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },

  // Subtle radial glows
  glowTop:    { position: 'absolute', top: -SW * 0.3, right: -SW * 0.2, width: SW, height: SW, borderRadius: SW / 2, backgroundColor: 'rgba(244, 63, 94, 0.06)' },
  glowBottom: { position: 'absolute', bottom: -SW * 0.3, left: -SW * 0.2, width: SW, height: SW, borderRadius: SW / 2, backgroundColor: 'rgba(99, 102, 241, 0.06)' },

  // Logo
  logoWrap:   { marginBottom: 24 },
  logoCircle: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#F43F5E', alignItems: 'center', justifyContent: 'center', shadowColor: '#F43F5E', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24 },
  logoE:      { fontSize: 42, fontWeight: '900', color: '#fff', marginTop: -2 },

  // Text
  brand:   { fontSize: 40, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -1 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 8, letterSpacing: 0.5 },

  // Loading
  loadBar:     { width: 48, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 48, overflow: 'hidden' },
  loadBarFill: { width: 48, height: 3, borderRadius: 2, backgroundColor: '#F43F5E' },

  // Bottom
  bottom:     { position: 'absolute', bottom: 60, alignItems: 'center' },
  bottomText: { fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: 1.5, textTransform: 'uppercase' },
})
