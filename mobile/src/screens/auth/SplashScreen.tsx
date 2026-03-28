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

  // Animations
  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const taglineTranslate = useRef(new Animated.Value(20)).current
  const dotsOpacity = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start()

    // Tagline fade in
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(taglineTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start()
    }, 400)

    // Loading dots
    setTimeout(() => {
      Animated.timing(dotsOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      // Pulse loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start()
    }, 700)
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
      {/* Background circles */}
      <View style={s.bgCircle1} />
      <View style={s.bgCircle2} />
      <View style={s.bgCircle3} />

      {/* Logo */}
      <Animated.View style={[s.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={s.logoIcon}>
          <View style={s.logoLeaf} />
          <View style={s.logoLeaf2} />
        </View>
        <Text style={s.logoText}>eClean</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: taglineOpacity, transform: [{ translateY: taglineTranslate }] }}>
        <Text style={s.tagline}>Clean cities. Real work. Instant pay.</Text>
      </Animated.View>

      {/* Loading indicator */}
      <Animated.View style={[s.dotsRow, { opacity: dotsOpacity }]}>
        <Animated.View style={[s.dot, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[s.dot, s.dotDelay1, { transform: [{ scale: pulseAnim }] }]} />
        <Animated.View style={[s.dot, s.dotDelay2, { transform: [{ scale: pulseAnim }] }]} />
      </Animated.View>

      {/* Bottom branding */}
      <View style={s.bottomBrand}>
        <Text style={s.bottomText}>AI-Powered Civic Cleaning</Text>
        <View style={s.bottomLine} />
        <Text style={s.versionText}>v1.0</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0F2B1A', alignItems: 'center', justifyContent: 'center' },

  // Background decoration
  bgCircle1:   { position: 'absolute', width: SW * 1.5, height: SW * 1.5, borderRadius: SW * 0.75, backgroundColor: 'rgba(22, 163, 74, 0.08)', top: -SW * 0.5, right: -SW * 0.3 },
  bgCircle2:   { position: 'absolute', width: SW * 1.2, height: SW * 1.2, borderRadius: SW * 0.6, backgroundColor: 'rgba(22, 163, 74, 0.05)', bottom: -SW * 0.4, left: -SW * 0.4 },
  bgCircle3:   { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(22, 163, 74, 0.12)', top: SH * 0.15, left: SW * 0.6 },

  // Logo
  logoWrap:     { alignItems: 'center', marginBottom: 16 },
  logoIcon:     { width: 72, height: 72, borderRadius: 20, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#16A34A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
  logoLeaf:     { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#fff', borderBottomLeftRadius: 4, transform: [{ rotate: '45deg' }] },
  logoLeaf2:    { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderBottomLeftRadius: 2, transform: [{ rotate: '45deg' }], top: 14, left: 14 },
  logoText:     { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },

  // Tagline
  tagline:      { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', letterSpacing: 0.5 },

  // Loading dots
  dotsRow:      { flexDirection: 'row', gap: 8, marginTop: 48 },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  dotDelay1:    { opacity: 0.7 },
  dotDelay2:    { opacity: 0.4 },

  // Bottom
  bottomBrand:  { position: 'absolute', bottom: 60, alignItems: 'center' },
  bottomText:   { fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textTransform: 'uppercase' },
  bottomLine:   { width: 30, height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 8 },
  versionText:  { fontSize: 11, color: 'rgba(255,255,255,0.2)' },
})
