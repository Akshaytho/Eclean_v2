/**
 * setup.screens.js — runs after every screen test file loads.
 * The heavy mocks (react-native, expo-*, etc.) are in moduleNameMapper.
 * This file handles the stores and services that need jest.mock() calls.
 */

global.React = require('react')

// ── socketStore: don't actually open a WebSocket ──────────────────────────────
jest.mock('../src/stores/socketStore', () => ({
  useSocketStore: () => ({
    connected:  true,
    connect:    jest.fn(),
    disconnect: jest.fn(),
    emit:       jest.fn(),
    joinTask:   jest.fn(),
    leaveTask:  jest.fn(),
  }),
  emitGPS: jest.fn(),
}))

// ── backgroundLocation hook: GPS without a real device ────────────────────────
jest.mock('../src/hooks/useBackgroundLocation', () => ({
  useBackgroundLocation: () => ({
    isTracking:    false,
    hasPermission: true,
    requestPermissions: jest.fn().mockResolvedValue(true),
    startTracking:      jest.fn().mockResolvedValue(true),
    stopTracking:       jest.fn().mockResolvedValue(undefined),
  }),
}))

// ── push permission util ───────────────────────────────────────────────────────
jest.mock('../src/utils/permissions', () => ({
  requestPushPermission: jest.fn().mockResolvedValue(null),
}))
