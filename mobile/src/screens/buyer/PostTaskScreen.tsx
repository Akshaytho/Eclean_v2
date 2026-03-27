// PostTaskScreen — 4-step wizard: Type → Location → Schedule → Confirm + Escrow
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS }        from '../../constants/colors'
import * as Location from 'expo-location'
import { buyerTasksApi } from '../../api/tasks.api'
import { DIRTY_LEVELS, URGENCY_LEVELS } from '../../constants/taskCategories'
import type { BuyerStackParamList } from '../../navigation/types'
import type { TaskCategory, DirtyLevel, TaskUrgency } from '../../types'

type Nav = NativeStackNavigationProp<BuyerStackParamList>

const CATEGORIES: { value: TaskCategory; label: string; emoji: string }[] = [
  { value: 'STREET_CLEANING',    label: 'Street Cleaning',     emoji: '🛣️' },
  { value: 'DRAIN_CLEANING',     label: 'Drain Cleaning',      emoji: '🌊' },
  { value: 'GARBAGE_COLLECTION', label: 'Garbage Collection',  emoji: '🗑️' },
  { value: 'PARK_CLEANING',      label: 'Park / Garden',       emoji: '🌳' },
  { value: 'GRAFFITI_REMOVAL',   label: 'Graffiti Removal',    emoji: '🖌️' },
  { value: 'WATER_BODY',         label: 'Water Body',          emoji: '💧' },
  { value: 'PUBLIC_TOILET',      label: 'Public Toilet',       emoji: '🚻' },
  { value: 'OTHER',              label: 'Other',               emoji: '📦' },
]

const STEPS = ['Type', 'Details', 'Location', 'Confirm']

interface FormState {
  title:       string
  description: string
  category:    TaskCategory
  dirtyLevel:  DirtyLevel
  urgency:     TaskUrgency
  address:     string
  lat:         number | null
  lng:         number | null
}

const INITIAL: FormState = {
  title: '', description: '', category: 'STREET_CLEANING',
  dirtyLevel: 'MEDIUM', urgency: 'MEDIUM',
  address: '', lat: null, lng: null,
}

export function PostTaskScreen() {
  const navigation = useNavigation<Nav>()
  const qc         = useQueryClient()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [gpsLoading, setGpsLoading] = useState(false)

  const useMyLocation = async () => {
    setGpsLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location in Settings to use this feature.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      set('lat', loc.coords.latitude)
      set('lng', loc.coords.longitude)
      // Reverse geocode to get address
      const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      if (geo[0]) {
        const g = geo[0]
        const addr = [g.street, g.district, g.city, g.region].filter(Boolean).join(', ')
        set('address', addr)
      }
    } catch {
      Alert.alert('Error', 'Could not get your location. Please enter address manually.')
    } finally {
      setGpsLoading(false)
    }
  }

  const set = (key: keyof FormState, val: any) => setForm(f => ({ ...f, [key]: val }))

  const price = DIRTY_LEVELS[form.dirtyLevel]?.priceCents ?? 6000

  const mutation = useMutation({
    mutationFn: () => buyerTasksApi.createTask({
      title:           form.title.trim(),
      description:     form.description.trim(),
      category:        form.category,
      dirtyLevel:      form.dirtyLevel,
      urgency:         form.urgency,
      // rateCents auto-calculated by backend based on dirtyLevel
      locationAddress: form.address.trim() || undefined,
      locationLat:     form.lat ?? undefined,
      locationLng:     form.lng ?? undefined,
    }),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['buyer-tasks-active'] })
      Alert.alert(
        'Task Posted! 🎉',
        `Your task is live. Workers near you can see it now.`,
        [{ text: 'View Task', onPress: () => {
          navigation.navigate('BuyerTaskDetail', { taskId: task.id })
        }}],
      )
      setForm(INITIAL)
      setStep(0)
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not post task. Try again.')
    },
  })

  const canNext = () => {
    if (step === 0) return !!form.category
    if (step === 1) return form.title.trim().length > 3 && form.description.trim().length > 10
    if (step === 2) return true // location optional
    return true
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else mutation.mutate()
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={s.header}>
        <TouchableOpacity onPress={() => step > 0 ? setStep(s => s - 1) : navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Post a Task</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* Step indicators */}
      <View style={s.stepRow}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.stepItem}>
            <View style={[s.stepDot, i <= step && s.stepDotActive]}>
              {i < step
                ? <CheckCircle size={14} color="#fff" />
                : <Text style={[s.stepNum, i <= step && s.stepNumActive]}>{i + 1}</Text>}
            </View>
            <Text style={[s.stepLabel, i <= step && s.stepLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
        {/* Step 0: Category */}
        {step === 0 && (
          <View>
            <Text style={s.stepTitle}>What needs cleaning?</Text>
            <View style={s.categoryGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.value}
                  style={[s.categoryCard, form.category === cat.value && s.categoryCardActive]}
                  onPress={() => set('category', cat.value)}
                  activeOpacity={0.8}
                >
                  <Text style={s.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={[s.categoryLabel, form.category === cat.value && s.categoryLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <View style={s.formGroup}>
            <Text style={s.stepTitle}>Describe the task</Text>

            <Text style={s.fieldLabel}>Task Title</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. Clean blocked drain on MG Road"
              value={form.title}
              onChangeText={v => set('title', v)}
              placeholderTextColor={COLORS.neutral[400]}
            />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={[s.textInput, s.textArea]}
              placeholder="Describe the exact issue, size, any special instructions..."
              value={form.description}
              onChangeText={v => set('description', v)}
              multiline
              numberOfLines={4}
              placeholderTextColor={COLORS.neutral[400]}
            />

            <Text style={s.fieldLabel}>Condition Level</Text>
            <View style={s.optionRow}>
              {(Object.keys(DIRTY_LEVELS) as DirtyLevel[]).map(level => (
                <TouchableOpacity
                  key={level}
                  style={[s.optionChip, form.dirtyLevel === level && { borderColor: DIRTY_LEVELS[level].color, backgroundColor: DIRTY_LEVELS[level].color + '18' }]}
                  onPress={() => set('dirtyLevel', level)}
                >
                  <Text style={[s.optionText, form.dirtyLevel === level && { color: DIRTY_LEVELS[level].color }]}>
                    {DIRTY_LEVELS[level].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Urgency</Text>
            <View style={s.optionRow}>
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskUrgency[]).map(u => (
                <TouchableOpacity
                  key={u}
                  style={[s.optionChip, form.urgency === u && s.optionChipActive]}
                  onPress={() => set('urgency', u)}
                >
                  <Text style={[s.optionText, form.urgency === u && s.optionTextActive]}>
                    {u.charAt(0) + u.slice(1).toLowerCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <View style={s.formGroup}>
            <Text style={s.stepTitle}>Where is it?</Text>
            <Text style={s.stepSub}>Location helps workers find your task faster</Text>

            <TouchableOpacity
              style={s.gpsBtn}
              onPress={useMyLocation}
              disabled={gpsLoading}
              activeOpacity={0.8}
            >
              {gpsLoading
                ? <ActivityIndicator size="small" color={COLORS.brand.primary} />
                : <Text style={s.gpsBtnText}>📍 Use My Location</Text>
              }
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Or enter address manually</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. MG Road, near Bus Stop 12, Hyderabad"
              value={form.address}
              onChangeText={v => set('address', v)}
              placeholderTextColor={COLORS.neutral[400]}
            />
            {form.lat && form.lng && (
              <Text style={s.gpsConfirm}>✅ GPS coordinates captured ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</Text>
            )}
            <Text style={s.hint}>Location is optional — you can skip this step</Text>
          </View>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <View style={s.formGroup}>
            <Text style={s.stepTitle}>Review & Confirm</Text>

            <View style={s.summaryCard}>
              <SummaryRow label="Task"      value={form.title || '—'} />
              <SummaryRow label="Category"  value={CATEGORIES.find(c => c.value === form.category)?.label ?? ''} />
              <SummaryRow label="Condition" value={DIRTY_LEVELS[form.dirtyLevel]?.label + ' dirty'} />
              <SummaryRow label="Urgency"   value={form.urgency} />
              {form.address ? <SummaryRow label="Location" value={form.address} /> : null}
              <View style={s.divider} />
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>You pay</Text>
                <Text style={s.priceValue}>₹{price / 100}</Text>
              </View>
              <Text style={s.priceNote}>Held in escrow · Released on approval</Text>
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer CTA */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.nextBtn, !canNext() && s.nextBtnDisabled]}
          onPress={next}
          disabled={!canNext() || mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Text style={s.nextBtnText}>
                  {step === STEPS.length - 1 ? `Post Task — ₹${price / 100}` : 'Continue'}
                </Text>
                {step < STEPS.length - 1 && <ChevronRight size={18} color="#fff" />}
              </>
            )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: COLORS.background },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  backBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  stepRow:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot:  { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.neutral[200], alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: COLORS.brand.primary },
  stepNum:  { fontSize: 12, fontWeight: '700', color: COLORS.neutral[500] },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 10, color: COLORS.neutral[400], fontWeight: '500' },
  stepLabelActive: { color: COLORS.brand.primary },
  body:     { flex: 1, padding: 20 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: COLORS.neutral[900], marginBottom: 6 },
  stepSub:   { fontSize: 14, color: COLORS.neutral[500], marginBottom: 20 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  categoryCard: { width: '47%', backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 2, borderColor: COLORS.border },
  categoryCardActive: { borderColor: COLORS.brand.primary, backgroundColor: COLORS.brand.tint },
  categoryEmoji: { fontSize: 32 },
  categoryLabel: { fontSize: 13, fontWeight: '600', color: COLORS.neutral[700], textAlign: 'center' },
  categoryLabelActive: { color: COLORS.brand.primary },
  formGroup: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.neutral[700], marginTop: 16, marginBottom: 8 },
  textInput: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: COLORS.neutral[900] },
  textArea:  { height: 100, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  optionChipActive: { borderColor: COLORS.brand.primary, backgroundColor: COLORS.brand.tint },
  optionText: { fontSize: 13, fontWeight: '600', color: COLORS.neutral[600] },
  optionTextActive: { color: COLORS.brand.primary },
  hint:     { fontSize: 12, color: COLORS.neutral[400], marginTop: 8 },
  gpsBtn:   { backgroundColor: COLORS.brand.tint, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.brand.primary, marginBottom: 16 },
  gpsBtnText:{ fontSize: 15, fontWeight: '700', color: COLORS.brand.primary },
  gpsConfirm:{ fontSize: 12, color: '#16A34A', fontWeight: '600', marginTop: 6 },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: COLORS.border },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel:{ fontSize: 13, color: COLORS.neutral[500] },
  summaryValue:{ fontSize: 13, fontWeight: '600', color: COLORS.neutral[800], flex: 1, textAlign: 'right' },
  divider:    { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  priceRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 16, fontWeight: '700', color: COLORS.neutral[800] },
  priceValue: { fontSize: 28, fontWeight: '800', color: COLORS.brand.primary },
  priceNote:  { fontSize: 12, color: COLORS.neutral[400] },
  footer:     { padding: 20, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextBtn:    { backgroundColor: COLORS.brand.primary, borderRadius: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },
})
