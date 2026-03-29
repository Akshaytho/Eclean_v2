// Onboarding — 4 swipeable slides that sell the eClean vision.
// Designed to hook workers, buyers, and citizens — role-neutral.

import React, { useRef, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, Dimensions,
  TouchableOpacity, type ListRenderItem,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/types'

const { width: SW, height: SH } = Dimensions.get('window')

const SLIDES = [
  {
    id: '1',
    icon: '🏙️',
    title: 'Cleaner Cities\nStart Here',
    body: 'eClean connects people who care about clean public spaces with verified workers who get the job done.',
    bg: '#0F172A',
    accent: '#3B82F6',
  },
  {
    id: '2',
    icon: '🧹',
    title: 'Workers Earn.\nBuyers Relax.',
    body: 'Post a cleaning task with location & photo. Nearby verified workers accept, clean, and upload proof.',
    bg: '#1A1A2E',
    accent: '#10B981',
  },
  {
    id: '3',
    icon: '🤖',
    title: 'AI Verifies\nEvery Job',
    body: 'Before & after photos scored by AI. No fake work. Payment auto-releases only when quality is confirmed.',
    bg: '#1E1B2E',
    accent: '#8B5CF6',
  },
  {
    id: '4',
    icon: '💸',
    title: 'Instant Pay.\nZero Hassle.',
    body: 'Workers get paid immediately. Buyers track live GPS. Citizens report problem areas. Everyone wins.',
    bg: '#1C1917',
    accent: '#F59E0B',
  },
] as const

type Slide = (typeof SLIDES)[number]
type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Onboarding'> }

export function OnboardingScreen({ navigation }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const insets = useSafeAreaInsets()

  const isLast = activeIndex === SLIDES.length - 1

  const renderItem: ListRenderItem<Slide> = ({ item }) => (
    <View style={[s.slide, { backgroundColor: item.bg }]}>
      {/* Glow circle behind icon */}
      <View style={[s.glowCircle, { backgroundColor: item.accent + '15' }]} />

      <Text style={s.icon}>{item.icon}</Text>
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.body}>{item.body}</Text>

      {/* Accent line */}
      <View style={[s.accentLine, { backgroundColor: item.accent }]} />
    </View>
  )

  const handleNext = () => {
    if (!isLast) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 })
    } else {
      navigation.replace('Login')
    }
  }

  const activeSlide = SLIDES[activeIndex]

  return (
    <View style={[s.root, { backgroundColor: activeSlide.bg }]}>
      <FlatList
        ref={flatListRef}
        data={SLIDES as unknown as Slide[]}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SW)
          setActiveIndex(idx)
        }}
      />

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
        {/* Dots */}
        <View style={s.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.id}
              style={[
                s.dot,
                i === activeIndex && [s.dotActive, { backgroundColor: activeSlide.accent }],
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: activeSlide.accent }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={s.ctaText}>
            {isLast ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity onPress={() => navigation.replace('Login')} style={s.skipBtn}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        )}

        {/* Login link on last slide */}
        {isLast && (
          <View style={s.loginRow}>
            <Text style={s.loginLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Login')}>
              <Text style={[s.loginLink, { color: activeSlide.accent }]}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },

  slide: {
    width: SW, flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36,
  },

  glowCircle: {
    position: 'absolute',
    width: SW * 0.7, height: SW * 0.7, borderRadius: SW * 0.35,
    top: SH * 0.12,
  },

  icon:  { fontSize: 80, marginBottom: 28 },
  title: { fontSize: 36, fontWeight: '900', color: '#fff', textAlign: 'center', lineHeight: 44, letterSpacing: -0.5 },
  body:  { fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 24, marginTop: 18, maxWidth: 300 },

  accentLine: { width: 40, height: 3, borderRadius: 2, marginTop: 28 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', gap: 16, paddingHorizontal: 28,
  },

  dots:      { flexDirection: 'row', gap: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 28, borderRadius: 4 },

  ctaBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  ctaText: { fontSize: 18, fontWeight: '800', color: '#fff' },

  skipBtn:  { paddingVertical: 8 },
  skipText: { fontSize: 15, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  loginRow:   { flexDirection: 'row', marginTop: 4 },
  loginLabel: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
  loginLink:  { fontSize: 14, fontWeight: '700' },
})
