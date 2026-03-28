/**
 * CreateReportScreen
 * Backend: POST /api/v1/citizen/reports
 * Body:    { category, description, urgency, lat, lng, locationAddress? }
 */
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import * as Location from 'expo-location'
import { MapPin, ChevronLeft, Loader } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { citizenApi }     from '../../api/citizen.api'
import { COLORS }         from '../../constants/colors'

type Category = 'STREET_CLEANING'|'PARK_CLEANING'|'DRAIN_CLEANING'|'GARBAGE_COLLECTION'|'GRAFFITI_REMOVAL'|'WATER_BODY'|'PUBLIC_TOILET'|'OTHER'
type Urgency  = 'LOW'|'MEDIUM'|'HIGH'|'URGENT'

const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: 'STREET_CLEANING',    label: 'Street',   emoji: '🛣️' },
  { value: 'DRAIN_CLEANING',     label: 'Drain',    emoji: '🌊' },
  { value: 'GARBAGE_COLLECTION', label: 'Garbage',  emoji: '🗑️' },
  { value: 'PARK_CLEANING',      label: 'Park',     emoji: '🌳' },
  { value: 'GRAFFITI_REMOVAL',   label: 'Graffiti', emoji: '🎨' },
  { value: 'WATER_BODY',         label: 'Water',    emoji: '💧' },
  { value: 'PUBLIC_TOILET',      label: 'Toilet',   emoji: '🚻' },
  { value: 'OTHER',              label: 'Other',    emoji: '📋' },
]

const URGENCIES: { value: Urgency; label: string; color: string; desc: string }[] = [
  { value: 'LOW',    label: 'Low',    color: '#9E968A', desc: 'Can wait a few days' },
  { value: 'MEDIUM', label: 'Medium', color: '#F59E0B', desc: 'Should be cleaned soon' },
  { value: 'HIGH',   label: 'High',   color: '#EF4444', desc: 'Needs attention today' },
  { value: 'URGENT', label: 'Urgent', color: '#DC2626', desc: 'Health/safety risk' },
]

export function CreateReportScreen() {
  const navigation = useNavigation<any>()
  const insets     = useSafeAreaInsets()
  const qc         = useQueryClient()

  const [category,    setCategory]    = useState<Category | null>(null)
  const [urgency,     setUrgency]     = useState<Urgency>('MEDIUM')
  const [description, setDescription] = useState('')
  const [lat,         setLat]         = useState<number | null>(null)
  const [lng,         setLng]         = useState<number | null>(null)
  const [address,     setAddress]     = useState('')
  const [gpsLoading,  setGpsLoading]  = useState(false)

  const submitMutation = useMutation({
    mutationFn: () => citizenApi.createReport({
      category:        category!,
      description:     description.trim(),
      urgency,
      lat:             lat!,
      lng:             lng!,
      locationAddress: address || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citizen-reports'] })
      Alert.alert(
        'Report Submitted! 📍',
        'Thank you for helping keep your city clean. A supervisor will review your report soon.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      )
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not submit report')
    },
  })

  const useMyLocation = async () => {
    setGpsLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Please enable location access in Settings')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setLat(loc.coords.latitude)
      setLng(loc.coords.longitude)
      setAddress(`${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`)
    } catch {
      Alert.alert('Error', 'Could not get your location')
    } finally {
      setGpsLoading(false)
    }
  }

  const canSubmit = category && description.trim().length >= 10 && lat && lng

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color={COLORS.neutral[900]} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Report a Problem</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Category */}
        <View style={s.section}>
          <Text style={s.label}>What needs attention? <Text style={s.required}>*</Text></Text>
          <View style={s.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.value}
                style={[s.catCard, category === cat.value && s.catCardActive]}
                onPress={() => setCategory(cat.value)}
                activeOpacity={0.75}
              >
                <Text style={s.catEmoji}>{cat.emoji}</Text>
                <Text style={[s.catLabel, category === cat.value && s.catLabelActive]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Urgency */}
        <View style={s.section}>
          <Text style={s.label}>How urgent? <Text style={s.required}>*</Text></Text>
          <View style={s.urgencyRow}>
            {URGENCIES.map(u => (
              <TouchableOpacity
                key={u.value}
                style={[s.urgencyCard, urgency === u.value && { borderColor: u.color, backgroundColor: u.color + '12' }]}
                onPress={() => setUrgency(u.value)}
                activeOpacity={0.75}
              >
                <Text style={[s.urgencyLabel, urgency === u.value && { color: u.color }]}>{u.label}</Text>
                <Text style={s.urgencyDesc}>{u.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description */}
        <View style={s.section}>
          <Text style={s.label}>Describe the problem <Text style={s.required}>*</Text></Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. Large pile of garbage near bus stop, has been here for 3 days..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor={COLORS.neutral[400]}
          />
          <Text style={[s.charHint, description.length < 10 && description.length > 0 && s.charHintWarn]}>
            {description.length} chars {description.length < 10 ? `(${10 - description.length} more needed)` : '✓'}
          </Text>
        </View>

        {/* Location */}
        <View style={s.section}>
          <Text style={s.label}>Location <Text style={s.required}>*</Text></Text>
          <TouchableOpacity style={s.gpsBtn} onPress={useMyLocation} disabled={gpsLoading} activeOpacity={0.8}>
            {gpsLoading
              ? <ActivityIndicator size="small" color={COLORS.brand.primary} />
              : <MapPin size={18} color={COLORS.brand.primary} />
            }
            <Text style={s.gpsBtnText}>{lat ? '✓ Location captured' : 'Use My Location'}</Text>
          </TouchableOpacity>
          {lat && (
            <Text style={s.coordText}>{lat.toFixed(5)}, {lng?.toFixed(5)}</Text>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Submit footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          onPress={() => submitMutation.mutate()}
          disabled={!canSubmit || submitMutation.isPending}
          activeOpacity={0.85}
        >
          {submitMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitText}>Submit Report</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.neutral[900] },
  section:     { paddingHorizontal: 20, marginTop: 24 },
  label:       { fontSize: 14, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 12 },
  required:    { color: COLORS.status.error },
  catGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catCard:     { width: '22%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border },
  catCardActive:{ borderColor: COLORS.brand.primary, backgroundColor: COLORS.brand.tint },
  catEmoji:    { fontSize: 24, marginBottom: 4 },
  catLabel:    { fontSize: 10, fontWeight: '600', color: COLORS.neutral[500], textAlign: 'center' },
  catLabelActive:{ color: COLORS.brand.primary },
  urgencyRow:  { gap: 8 },
  urgencyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: COLORS.border },
  urgencyLabel:{ fontSize: 14, fontWeight: '700', color: COLORS.neutral[700], width: 60 },
  urgencyDesc: { fontSize: 12, color: COLORS.neutral[400], flex: 1 },
  textInput:   { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 14, color: COLORS.neutral[900], minHeight: 100, textAlignVertical: 'top' },
  charHint:    { fontSize: 11, color: COLORS.neutral[400], textAlign: 'right', marginTop: 4 },
  charHintWarn:{ color: '#F59E0B' },
  gpsBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.brand.tint, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: COLORS.brand.primary },
  gpsBtnText:  { fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  coordText:   { fontSize: 12, color: COLORS.neutral[400], marginTop: 6, textAlign: 'center' },
  footer:      { paddingHorizontal: 20, paddingTop: 12, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn:   { backgroundColor: COLORS.brand.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  submitBtnDisabled:{ backgroundColor: COLORS.neutral[200] },
  submitText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
})
