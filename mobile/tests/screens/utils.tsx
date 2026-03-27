/**
 * Shared test utilities for screen-level UI flow tests.
 *
 * renderScreen() wraps any screen with:
 *   - QueryClientProvider (React Query)
 *   - NavigationContainer (so useNavigation / useRoute work)
 *   - Pre-configured navigation state (so the screen gets its route params)
 */

import React from 'react'
import { render, type RenderResult } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../../src/stores/authStore'
import { useActiveTaskStore } from '../../src/stores/activeTaskStore'
import type { User } from '../../src/types'

// ─── Fresh QueryClient per test (no cache bleed between tests) ────────────────

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

// ─── Wrapper that provides all the context a screen needs ────────────────────

interface RenderScreenOptions {
  routeParams?: Record<string, unknown>
  queryClient?: QueryClient
}

/**
 * Render a screen component inside a real NavigationContainer + QueryClient.
 *
 * Usage:
 *   const { getByText, getByPlaceholderText } = renderScreen(LoginScreen)
 *   const { getByText } = renderScreen(TaskDetailScreen, { routeParams: { taskId: 'abc' } })
 */
export function renderScreen(
  Screen: React.ComponentType<any>,
  options: RenderScreenOptions = {},
): RenderResult {
  const { routeParams = {}, queryClient = makeQueryClient() } = options
  const Stack = createNativeStackNavigator()

  return render(
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="Screen"
            component={Screen}
            initialParams={routeParams}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>,
  )
}

// ─── Auth store helpers ───────────────────────────────────────────────────────

const DEFAULT_WORKER: User = {
  id:    'worker-001',
  email: 'worker@eclean.test',
  name:  'Test Worker',
  role:  'WORKER',
}

const DEFAULT_BUYER: User = {
  id:    'buyer-001',
  email: 'buyer@eclean.test',
  name:  'Test Buyer',
  role:  'BUYER',
}

export function loginAsWorker(user: Partial<User> = {}) {
  useAuthStore.setState({ user: { ...DEFAULT_WORKER, ...user }, isLoggedIn: true, isLoading: false })
}

export function loginAsBuyer(user: Partial<User> = {}) {
  useAuthStore.setState({ user: { ...DEFAULT_BUYER, ...user }, isLoggedIn: true, isLoading: false })
}

export function logout() {
  useAuthStore.setState({ user: null, isLoggedIn: false, isLoading: false })
}

// ─── Task fixtures ────────────────────────────────────────────────────────────

export function makeTask(overrides = {}) {
  return {
    id:              'task-abc',
    title:           'Clean Drain on MG Road',
    description:     'Blocked storm drain near bus stop. Worker must bring their own tools.',
    category:        'DRAIN_CLEANING',
    dirtyLevel:      'HEAVY' as const,
    urgency:         'HIGH' as const,
    rateCents:       6000,
    status:          'OPEN' as const,
    buyerId:         'buyer-001',
    workerId:        null,
    locationLat:     17.385,
    locationLng:     78.4867,
    locationAddress: 'MG Road, Hyderabad',
    workWindowStart: '2026-03-27T06:00:00Z',
    workWindowEnd:   '2026-03-27T18:00:00Z',
    uploadWindowEnd: '2026-03-27T19:00:00Z',
    timezone:        'Asia/Kolkata',
    startedAt:       null,
    submittedAt:     null,
    completedAt:     null,
    cancelledAt:     null,
    timeSpentSecs:   null,
    aiScore:         null,
    aiReasoning:     null,
    createdAt:       '2026-03-27T05:00:00Z',
    updatedAt:       '2026-03-27T05:00:00Z',
    media:           [],
    ...overrides,
  }
}

// ─── Simulate pressing an Alert button ───────────────────────────────────────
// Alert.alert(title, msg, [{ text, onPress }]) — call the button by label.

export function pressAlertButton(buttonText: string) {
  const { Alert } = require('react-native')
  const calls = (Alert.alert as jest.Mock).mock.calls
  const lastCall = calls[calls.length - 1]
  if (!lastCall) throw new Error('No Alert was shown')
  const buttons = lastCall[2] as { text: string; onPress?: () => void }[]
  const btn = buttons.find((b) => b.text === buttonText)
  if (!btn) throw new Error(`Alert button "${buttonText}" not found. Available: ${buttons.map((b) => b.text).join(', ')}`)
  btn.onPress?.()
}
