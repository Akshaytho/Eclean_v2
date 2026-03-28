import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, Star } from 'lucide-react-native'
import { LinearGradient } from '../../components/LinearGradientShim'
import { COLORS }        from '../../constants/colors'
import { buyerTasksApi } from '../../api/tasks.api'
import type { BuyerStackParamList } from '../../navigation/types'

type Route = RouteProp<BuyerStackParamList, 'Rating'>

export function RatingScreen() {
  const navigation = useNavigation()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const qc         = useQueryClient()
  const [rating,   setRating]  = useState(0)
  const [comment,  setComment] = useState('')

  const mutation = useMutation({
    mutationFn: () => buyerTasksApi.rate(taskId, rating, comment.trim() || undefined),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      Alert.alert('Thanks for your feedback! 🙏', '', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ])
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not submit rating')
    },
  })

  const LABELS = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent!']

  return (
    <View style={s.root}>
      <LinearGradient colors={[COLORS.brand.primary, COLORS.brand.dark]} style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Rate the Worker</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <View style={s.body}>
        <Text style={s.prompt}>How was the work quality?</Text>

        {/* Star row */}
        <View style={s.stars}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
              <Star
                size={48}
                color={n <= rating ? '#F59E0B' : COLORS.neutral[300]}
                fill={n <= rating ? '#F59E0B' : 'none'}
              />
            </TouchableOpacity>
          ))}
        </View>

        {rating > 0 && (
          <Text style={s.ratingLabel}>{LABELS[rating]}</Text>
        )}

        <Text style={s.fieldLabel}>Comment (optional)</Text>
        <TextInput
          style={s.textInput}
          placeholder="What did you like or dislike about the work?"
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          placeholderTextColor={COLORS.neutral[400]}
        />

        <TouchableOpacity
          style={[s.submitBtn, (rating === 0 || mutation.isPending) && s.submitBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={rating === 0 || mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>Submit Rating</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.skipBtn} onPress={() => navigation.goBack()}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.surface },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  body:        { flex: 1, padding: 24 },
  prompt:      { fontSize: 20, fontWeight: '700', color: COLORS.neutral[900], textAlign: 'center', marginTop: 12, marginBottom: 32 },
  stars:       { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 16 },
  ratingLabel: { fontSize: 18, fontWeight: '700', color: '#F59E0B', textAlign: 'center', marginBottom: 24 },
  fieldLabel:  { fontSize: 14, fontWeight: '600', color: COLORS.neutral[700], marginBottom: 8 },
  textInput:   { backgroundColor: COLORS.neutral[50], borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.neutral[900], height: 100, textAlignVertical: 'top' },
  submitBtn:   { backgroundColor: COLORS.brand.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },
  skipBtn:     { alignItems: 'center', marginTop: 16 },
  skipText:    { fontSize: 14, color: COLORS.neutral[400] },
})
