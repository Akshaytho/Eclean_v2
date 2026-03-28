// PostTaskScreen — 4-step wizard: Type → Location → Schedule → Confirm + Escrow
import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Image, Modal,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ChevronLeft, ChevronRight, CheckCircle, Camera, X } from 'lucide-react-native'
import { CaptureCamera } from '../../components/camera/CaptureCamera'
import type { CaptureResult } from '../../components/camera/CaptureCamera'
import { mediaApi } from '../../api/media.api'
import { LinearGradient } from '../../components/LinearGradientShim'
import { COLORS }        from '../../constants/colors'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
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
  const [refPhoto, setRefPhoto] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

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
    onSuccess: async (task) => {
      // Upload reference photo if taken
      if (refPhoto) {
        try {
          await mediaApi.upload(task.id, refPhoto, 'REFERENCE')
        } catch {
          // photo upload failed but task is created — not critical
        }
      }
      qc.invalidateQueries({ queryKey: ['buyer-tasks-active'] })
      setForm(INITIAL)
      setRefPhoto(null)
      setStep(0)
      navigation.navigate('BuyerTaskDetail', { taskId: task.id })
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
      <LinearGradient colors={B.gradient} style={s.header}>
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
              placeholderTextColor={B.text.muted}
            />

            <Text style={s.fieldLabel}>Description</Text>
            <TextInput
              style={[s.textInput, s.textArea]}
              placeholder="Describe the exact issue, size, any special instructions..."
              value={form.description}
              onChangeText={v => set('description', v)}
              multiline
              numberOfLines={4}
              placeholderTextColor={B.text.muted}
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
                  <Text style={[s.optionPrice, form.dirtyLevel === level && { color: DIRTY_LEVELS[level].color }]}>
                    ₹{DIRTY_LEVELS[level].priceCents / 100}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Live pricing preview */}
            <View style={s.pricingPreview}>
              <Text style={s.pricingLabel}>Estimated cost:</Text>
              <Text style={s.pricingValue}>₹{DIRTY_LEVELS[form.dirtyLevel]?.priceCents / 100}</Text>
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
                ? <ActivityIndicator size="small" color={B.primary} />
                : <Text style={s.gpsBtnText}>📍 Use My Location</Text>
              }
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Or enter address manually</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. MG Road, near Bus Stop 12, Hyderabad"
              value={form.address}
              onChangeText={v => set('address', v)}
              placeholderTextColor={B.text.muted}
            />
            {form.lat && form.lng && (
              <Text style={s.gpsConfirm}>GPS coordinates captured ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</Text>
            )}

            <Text style={s.fieldLabel}>Reference Photo</Text>
            <Text style={s.hint}>Show workers what the area looks like</Text>
            {refPhoto ? (
              <View style={s.refPhotoWrap}>
                <Image source={{ uri: refPhoto }} style={s.refPhotoImg} resizeMode="cover" />
                <TouchableOpacity style={s.refPhotoRemove} onPress={() => setRefPhoto(null)}>
                  <X size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.refPhotoBtn} onPress={() => setCameraOpen(true)} activeOpacity={0.85}>
                <Camera size={22} color={B.primary} />
                <Text style={s.refPhotoBtnText}>Take a Photo</Text>
              </TouchableOpacity>
            )}
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
              {refPhoto ? <SummaryRow label="Photo" value="Reference photo attached" /> : null}
              <SummaryRow label="Work Window" value="07:00 – 11:30 AM" />
              <SummaryRow label="Upload By"   value="12:00 PM" />
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

      {/* Reference photo camera */}
      <Modal visible={cameraOpen} animationType="slide" statusBarTranslucent>
        <CaptureCamera
          taskId={null}
          photoType="GENERAL"
          onCapture={(result: CaptureResult) => {
            setCameraOpen(false)
            setRefPhoto(result.photo.fullUri)
          }}
          onClose={() => setCameraOpen(false)}
        />
      </Modal>

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
  root:     { flex: 1, backgroundColor: B.background },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 20 },
  backBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  stepRow:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: B.surface, borderBottomWidth: 1, borderBottomColor: B.border },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot:  { width: 26, height: 26, borderRadius: 13, backgroundColor: B.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: B.primary },
  stepNum:  { fontSize: 12, fontWeight: '700', color: B.text.secondary },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 10, color: B.text.muted, fontWeight: '500' },
  stepLabelActive: { color: B.primary },
  body:     { flex: 1, padding: 20 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: B.text.primary, marginBottom: 6 },
  stepSub:   { fontSize: 14, color: B.text.secondary, marginBottom: 20 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  categoryCard: { width: '47%', backgroundColor: B.surface, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 2, borderColor: B.border },
  categoryCardActive: { borderColor: B.primary, backgroundColor: B.primaryTint },
  categoryEmoji: { fontSize: 32 },
  categoryLabel: { fontSize: 13, fontWeight: '600', color: B.text.secondary, textAlign: 'center' },
  categoryLabelActive: { color: B.primary },
  formGroup: { gap: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: B.text.secondary, marginTop: 16, marginBottom: 8 },
  textInput: { backgroundColor: B.surface, borderWidth: 1.5, borderColor: B.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: B.text.primary },
  textArea:  { height: 100, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: B.border, backgroundColor: B.surface },
  optionChipActive: { borderColor: B.primary, backgroundColor: B.primaryTint },
  optionText: { fontSize: 13, fontWeight: '600', color: B.text.secondary },
  optionTextActive: { color: B.primary },
  hint:         { fontSize: 12, color: B.text.muted, marginTop: 8 },
  optionPrice:  { fontSize: 11, fontWeight: '700', marginTop: 2 },
  pricingPreview:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: B.primaryTint, borderRadius: 10, padding: 12, marginTop: 10 },
  pricingLabel: { fontSize: 13, color: B.primary, fontWeight: '600' },
  pricingValue: { fontSize: 20, fontWeight: '800', color: B.primary },
  gpsBtn:   { backgroundColor: B.primaryTint, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: B.primary, marginBottom: 16 },
  gpsBtnText:{ fontSize: 15, fontWeight: '700', color: B.primary },
  gpsConfirm:{ fontSize: 12, color: '#16A34A', fontWeight: '600', marginTop: 6 },
  refPhotoBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: B.primaryTint, borderRadius: 12, paddingVertical: 40, borderWidth: 1.5, borderColor: B.border, borderStyle: 'dashed', marginTop: 8 },
  refPhotoBtnText: { fontSize: 15, fontWeight: '600', color: B.primary },
  refPhotoWrap:  { marginTop: 8, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  refPhotoImg:   { width: '100%', height: 180, borderRadius: 12 },
  refPhotoRemove:{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  summaryCard: { backgroundColor: B.surface, borderRadius: 16, padding: 20, gap: 12, borderWidth: 1, borderColor: B.border },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel:{ fontSize: 13, color: B.text.secondary },
  summaryValue:{ fontSize: 13, fontWeight: '600', color: B.text.primary, flex: 1, textAlign: 'right' },
  divider:    { height: 1, backgroundColor: B.border, marginVertical: 4 },
  priceRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 16, fontWeight: '700', color: B.text.primary },
  priceValue: { fontSize: 28, fontWeight: '800', color: B.primary },
  priceNote:  { fontSize: 12, color: B.text.muted },
  footer:     { padding: 20, backgroundColor: B.surface, borderTopWidth: 1, borderTopColor: B.border },
  nextBtn:    { backgroundColor: B.primary, borderRadius: 14, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },
})
