/**
 * PostSubmissionScreen — "Zomato order placed" experience.
 *
 * Shows real-time verification progress after worker submits.
 * Worker never feels abandoned — knows exactly what's happening.
 *
 * Steps:
 * 1. Photos uploaded ✅ (instant)
 * 2. GPS verified ✅ (instant)
 * 3. Motion verified ✅ (instant)
 * 4. AI checking your work... 🔄 (10-15 sec)
 * 5. Payment decision ⬜ (pending)
 *
 * "What happens next" section builds trust in the system.
 */

import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock, Search, ClipboardList } from 'lucide-react-native'

import { ScreenWrapper } from '../../components/layout/ScreenWrapper'
import { WORKER_THEME as W } from '../../constants/workerTheme'
import { workerTasksApi } from '../../api/tasks.api'
import { formatMoney } from '../../utils/formatMoney'
import type { WorkerStackParamList } from '../../navigation/types'

type Nav   = NativeStackNavigationProp<WorkerStackParamList>
type Route = RouteProp<WorkerStackParamList, 'PostSubmission'>

export function PostSubmissionScreen() {
  const navigation = useNavigation<Nav>()
  const route      = useRoute<Route>()
  const { taskId } = route.params

  // Poll task for AI verification result
  const { data: task } = useQuery({
    queryKey: ['worker', 'task', taskId],
    queryFn:  () => workerTasksApi.getTask(taskId),
    refetchInterval: 10_000, // Poll every 10s — gentler on battery and data
  })

  const aiDone = task?.aiScore != null
  const decision = task?.finalDecision

  // Simulated progress steps
  const [step, setStep] = useState(1)
  useEffect(() => {
    const t1 = setTimeout(() => setStep(2), 800)
    const t2 = setTimeout(() => setStep(3), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // When AI finishes, advance to step 5
  useEffect(() => {
    if (aiDone) setStep(5)
  }, [aiDone])

  return (
    <ScreenWrapper backgroundColor={W.background}>
      <View style={s.container}>
        {/* Big checkmark */}
        <View style={s.heroSection}>
          <View style={s.checkCircle}>
            <CheckCircle size={48} color="#fff" />
          </View>
          <Text style={s.heroTitle}>Work Submitted!</Text>
          {task && <Text style={s.heroSub}>{task.title}</Text>}
        </View>

        {/* Verification progress */}
        <View style={s.progressCard}>
          <Text style={s.progressTitle}>Verification in progress</Text>

          <ProgressStep done={step >= 1} label="Photos uploaded" />
          <ProgressStep done={step >= 2} label="GPS verified" />
          <ProgressStep done={step >= 3} label="Motion verified" />
          <ProgressStep
            done={aiDone}
            loading={step >= 3 && !aiDone}
            label={aiDone ? 'AI verification complete' : 'AI checking your work...'}
          />
          <ProgressStep
            done={aiDone}
            label={aiDone
              ? decision === 'AUTO_PASS' ? 'Payment released!'
                : decision === 'WORKER_GRACE' ? 'Payment in 12 hours'
                : decision === 'REJECT' ? 'Needs review'
                : 'Buyer will review'
              : 'Payment decision'
            }
          />

          {!aiDone && (
            <Text style={s.reassurance}>Usually takes less than 1 minute</Text>
          )}

          {aiDone && decision === 'AUTO_PASS' && (
            <View style={s.resultBanner}>
              <Text style={s.resultBannerText}>
                {formatMoney(task?.rateCents ?? 0, 'INR')} released to your account!
              </Text>
            </View>
          )}

          {aiDone && decision === 'WORKER_GRACE' && (
            <View style={[s.resultBanner, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[s.resultBannerText, { color: '#92400E' }]}>
                Payment auto-releases in 12 hours unless buyer reviews
              </Text>
            </View>
          )}
        </View>

        {/* What happens next */}
        <View style={s.nextCard}>
          <Text style={s.nextTitle}>What happens next</Text>

          <View style={s.nextRow}>
            <Text style={s.nextEmoji}>{'💰'}</Text>
            <View style={s.nextText}>
              <Text style={s.nextLabel}>If AI approves</Text>
              <Text style={s.nextDesc}>
                {formatMoney(task?.rateCents ?? 0, 'INR')} released instantly
              </Text>
            </View>
          </View>

          <View style={s.nextRow}>
            <Text style={s.nextEmoji}>{'⏱'}</Text>
            <View style={s.nextText}>
              <Text style={s.nextLabel}>If review needed</Text>
              <Text style={s.nextDesc}>Buyer reviews in 12-72 hours</Text>
            </View>
          </View>

          <View style={s.nextRow}>
            <Text style={s.nextEmoji}>{'✅'}</Text>
            <View style={s.nextText}>
              <Text style={s.nextLabel}>Auto-release guarantee</Text>
              <Text style={s.nextDesc}>Payment released automatically if buyer doesn't respond</Text>
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => (navigation as any).navigate('FindWork')}
            activeOpacity={0.85}
          >
            <Search size={18} color="#fff" />
            <Text style={s.primaryBtnText}>FIND MORE WORK</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => (navigation as any).navigate('WorkerTabs', { screen: 'MyTasks' })}
            activeOpacity={0.85}
          >
            <ClipboardList size={16} color={W.primary} />
            <Text style={s.secondaryBtnText}>VIEW MY TASKS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  )
}

function ProgressStep({ done, loading, label }: { done: boolean; loading?: boolean; label: string }) {
  return (
    <View style={s.stepRow}>
      {done ? (
        <CheckCircle size={20} color={W.primary} />
      ) : loading ? (
        <ActivityIndicator size={16} color={W.primary} />
      ) : (
        <View style={s.stepCircle} />
      )}
      <Text style={[s.stepLabel, done && s.stepLabelDone]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container:     { flex: 1, padding: 20, gap: 20 },

  // Hero
  heroSection:   { alignItems: 'center', paddingTop: 20, gap: 8 },
  checkCircle:   { width: 80, height: 80, borderRadius: 40, backgroundColor: W.primary, alignItems: 'center', justifyContent: 'center' },
  heroTitle:     { fontSize: 24, fontWeight: '800', color: W.text.primary },
  heroSub:       { fontSize: 14, color: W.text.muted },

  // Progress
  progressCard:  { backgroundColor: W.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: W.border },
  progressTitle: { fontSize: 15, fontWeight: '700', color: W.text.primary },
  stepRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepCircle:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: W.border },
  stepLabel:     { fontSize: 14, color: W.text.secondary },
  stepLabelDone: { color: W.text.primary, fontWeight: '600' },
  reassurance:   { fontSize: 12, color: W.text.muted, textAlign: 'center', marginTop: 4 },
  resultBanner:  { backgroundColor: '#DCFCE7', borderRadius: 10, padding: 14, marginTop: 4 },
  resultBannerText: { fontSize: 14, fontWeight: '700', color: '#15803D', textAlign: 'center' },

  // What happens next
  nextCard:      { backgroundColor: W.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: W.border },
  nextTitle:     { fontSize: 15, fontWeight: '700', color: W.text.primary },
  nextRow:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  nextEmoji:     { fontSize: 20, width: 28 },
  nextText:      { flex: 1 },
  nextLabel:     { fontSize: 13, fontWeight: '600', color: W.text.primary },
  nextDesc:      { fontSize: 12, color: W.text.muted, marginTop: 2 },

  // Actions
  actions:       { gap: 10 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: W.primary, borderRadius: 14, paddingVertical: 16 },
  primaryBtnText:{ fontSize: 15, fontWeight: '700', color: '#fff' },
  secondaryBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: W.primary, borderRadius: 14, paddingVertical: 14 },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: W.primary },
})
