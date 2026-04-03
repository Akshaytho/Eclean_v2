import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { WifiOff } from 'lucide-react-native'

/**
 * OfflineBanner — drop into any screen's top-level View.
 * Shows "No internet connection" bar when offline.
 * Auto-hides when reconnected. Slides in/out smoothly.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false)
  const [slideAnim] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const offline = !(state.isConnected && state.isInternetReachable !== false)
      setIsOffline(offline)
      Animated.timing(slideAnim, {
        toValue: offline ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start()
    })
    return () => unsub()
  }, [slideAnim])

  if (!isOffline) return null

  return (
    <Animated.View
      style={[
        s.banner,
        {
          opacity: slideAnim,
          transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
        },
      ]}
    >
      <WifiOff size={14} color="#fff" />
      <Text style={s.text}>No internet connection</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
