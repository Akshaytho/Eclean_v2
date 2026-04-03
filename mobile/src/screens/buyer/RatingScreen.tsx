import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { ChevronLeft, Star } from 'lucide-react-native'
import { LinearGradient } from '../../components/LinearGradientShim'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS }        from '../../constants/colors'
import { BUYER_THEME as B } from '../../constants/buyerTheme'
import { buyerTasksApi } from '../../api/tasks.api'
import type { BuyerStackParamList } from '../../navigation/types'

type Route = RouteProp<BuyerStackParamList, 'Rating'>

export function RatingScreen() {
  const navigation = useNavigation()
  const route      = useRoute<Route>()
  const { taskId } = route.params
  const qc         = useQueryClient()
  const insets     = useSafeAreaInsets()
  const [rating,   setRating]  = useState(0)
  const [comment,  setComment] = useState('')

  // Fetch task to validate status before allowing rating
  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['buyer-task', taskId],
    queryFn:  () => buyerTasksApi.getTask(taskId),
    staleTime: 30_000,
  })

  const canRate = task && (task.status === 'APPROVED' || task.status === 'COMPLETED') && !task.buyerRating

  const mutation = useMutation({
    mutationFn: () => buyerTasksApi.rate(taskId, rating, comment.trim() || undefined),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['buyer-task', taskId] })
      Alert.alert('Thanks for your feedback!', '', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ])
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.error?.message ?? 'Could not submit rating')
    },
  })

  const LABELS = ['', 'Terrible', 'Poor', 'OK', 'Good', 'Excellent!']

  if (taskLoading) {
    return <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={B.primary} /></View>
  }

  if (task?.buyerRating) {
    return (
      <View style={s.root}>
        <LinearGradient colors={B.gradient} style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ChevronLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Already Rated</Text>
          <View style={{ width: 36 }} />
        </LinearGradient>
        <View style={[s.body, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={s.prompt}>You've already rated this task</Text>
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} size={48} color={n <= (task.buyerRating ?? 0) ? '#F59E0B' : B.text.muted} fill={n <= (task.buyerRating ?? 0) ? '#F59E0B' : 'none'} />
            ))}
          </View>
          <TouchableOpacity style={s.skipBtn} onPress={() => navigation.goBack()}>
            <Text style={[s.skipText, { color: B.primary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={B.gradient} style={[s.header, { paddingTop: (insets.top > 0 ? insets.top : 24) + 8 }]}>
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
                color={n <= rating ? '#F59E0B' : B.text.muted}
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
          placeholderTextColor={B.text.muted}
        />

        <TouchableOpacity
          style={[s.submitBtn, (rating === 0 || mutation.isPending || !canRate) && s.submitBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={rating === 0 || mutation.isPending || !canRate}
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
  root:        { flex: 1, backgroundColor: B.surface },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, paddingHorizontal: 20 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  body:        { flex: 1, padding: 24 },
  prompt:      { fontSize: 20, fontWeight: '700', color: B.text.primary, textAlign: 'center', marginTop: 12, marginBottom: 32 },
  stars:       { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 16 },
  ratingLabel: { fontSize: 18, fontWeight: '700', color: '#F59E0B', textAlign: 'center', marginBottom: 24 },
  fieldLabel:  { fontSize: 14, fontWeight: '600', color: B.text.secondary, marginBottom: 8 },
  textInput:   { backgroundColor: COLORS.neutral[50], borderWidth: 1.5, borderColor: B.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: B.text.primary, height: 100, textAlignVertical: 'top' },
  submitBtn:   { backgroundColor: B.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff' },
  skipBtn:     { alignItems: 'center', marginTop: 16 },
  skipText:    { fontSize: 14, color: B.text.muted },
})
