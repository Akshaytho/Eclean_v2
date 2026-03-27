// Onboarding — 3 swipeable slides. Shows only to new/logged-out users.

import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  type ListRenderItem,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'
import { COLORS } from '../../constants/colors'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    id:       '1',
    emoji:    '🧹',
    title:    'Earn by Cleaning',
    body:     'Find cleaning tasks near you. Accept, clean, upload proof — get paid instantly.',
    gradient: [COLORS.brand.primary, COLORS.brand.dark] as const,
  },
  {
    id:       '2',
    emoji:    '📍',
    title:    'Real-Time Tracking',
    body:     'Buyers watch you work live on the map. AI verifies your photos automatically.',
    gradient: ['#7C3AED', '#4C1D95'] as const,
  },
  {
    id:       '3',
    emoji:    '💰',
    title:    'Fast Payments',
    body:     'AI score triggers instant payout. No waiting. No disputes. Clean cities, rewarded.',
    gradient: ['#059669', '#064E3B'] as const,
  },
] as const

type Slide = (typeof SLIDES)[number]

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>
}

export function OnboardingScreen({ navigation }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)

  const renderItem: ListRenderItem<Slide> = ({ item }) => (
    <LinearGradient colors={[...item.gradient]} style={styles.slide}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </LinearGradient>
  )

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 })
    } else {
      navigation.replace('Login')
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width)
          setActiveIndex(idx)
        }}
      />

      {/* Dots */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextText}>
            {activeIndex === SLIDES.length - 1 ? 'Get Started' : 'Next →'}
          </Text>
        </TouchableOpacity>

        {activeIndex < SLIDES.length - 1 && (
          <TouchableOpacity onPress={() => navigation.replace('Login')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  slide: {
    width,
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        40,
  },
  emoji:  { fontSize: 72, marginBottom: 24 },
  title:  { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16 },
  body:   { fontSize: 17, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 26 },
  footer: {
    position:   'absolute',
    bottom:     48,
    left:       0,
    right:      0,
    alignItems: 'center',
    gap:        16,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { backgroundColor: '#fff', width: 24 },
  nextBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
  },
  nextText: { fontSize: 16, fontWeight: '700', color: '#111' },
  skipText: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
})
