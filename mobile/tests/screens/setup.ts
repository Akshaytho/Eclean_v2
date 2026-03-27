/**
 * Global setup for screen-level UI flow tests.
 * Runs before every test file in tests/screens/.
 */

import '@testing-library/jest-native/extend-expect'

// ─── Socket store — prevent real socket connections ───────────────────────────
jest.mock('../../src/stores/socketStore', () => ({
  useSocketStore: () => ({
    connect:     jest.fn(),
    disconnect:  jest.fn(),
    emit:        jest.fn(),
    joinTask:    jest.fn(),
    leaveTask:   jest.fn(),
    connected:   false,
    socket:      null,
  }),
  emitGPS: jest.fn(),
}))

// ─── Background location service ─────────────────────────────────────────────
jest.mock('../../src/services/backgroundLocation', () => ({
  startBackgroundTracking:   jest.fn().mockResolvedValue(undefined),
  stopBackgroundTracking:    jest.fn().mockResolvedValue(undefined),
  isBackgroundTrackingActive: jest.fn().mockResolvedValue(false),
}))

// ─── useBackgroundLocation hook ───────────────────────────────────────────────
jest.mock('../../src/hooks/useBackgroundLocation', () => ({
  useBackgroundLocation: () => ({
    isTracking:    false,
    hasPermission: true,
    start:         jest.fn().mockResolvedValue(true),
    stop:          jest.fn().mockResolvedValue(undefined),
  }),
}))

// ─── Push permissions ─────────────────────────────────────────────────────────
jest.mock('../../src/utils/permissions', () => ({
  requestPushPermission: jest.fn().mockResolvedValue(null),
}))

// ─── Toast store ──────────────────────────────────────────────────────────────
jest.mock('../../src/stores/toastStore', () => ({
  toast: { show: jest.fn(), hide: jest.fn() },
  useToastStore: () => ({ toasts: [], addToast: jest.fn(), removeToast: jest.fn() }),
}))

// ─── react-native-reanimated ──────────────────────────────────────────────────
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
)

// ─── react-native-gesture-handler ────────────────────────────────────────────
jest.mock('react-native-gesture-handler', () => {
  const RN = require('react-native')
  return {
    GestureHandlerRootView: RN.View,
    PanGestureHandler:      RN.View,
    TapGestureHandler:      RN.View,
    ScrollView:             RN.ScrollView,
    FlatList:               RN.FlatList,
    State:                  {},
    Directions:             {},
  }
})

// ─── ScreenWrapper passthrough ────────────────────────────────────────────────
jest.mock('../../src/components/layout/ScreenWrapper', () => {
  const { View } = require('react-native')
  return { ScreenWrapper: ({ children }: any) => children }
})

// ─── Alert — capture calls so tests can inspect and trigger button handlers ───
// Tests import Alert directly and use (Alert.alert as jest.Mock).mock.calls
