// Minimal React Native stub for non-UI tests (API + stores)
// This prevents "cannot find module 'react-native'" errors in node test env
export const Platform = { OS: 'ios', Version: '17' }
export const NativeModules = {}
export const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  currentState: 'active',
}
