/**
 * jest.screens.config.js — screen-level UI flow tests
 * Run: npx jest --config jest.screens.config.js
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/screens/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.screens.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(axios|zustand|@tanstack|@testing-library/react-native))',
  ],
  moduleNameMapper: {
    // The extended RN mock — used by both unit & screen tests
    '^react-native$':                    '<rootDir>/tests/__mocks__/react-native.ts',
    // Expo / native modules
    '^expo-secure-store$':               '<rootDir>/tests/__mocks__/expo-secure-store.ts',
    '^expo-constants$':                  '<rootDir>/tests/__mocks__/expo-constants.ts',
    '^expo-status-bar$':                 '<rootDir>/tests/__mocks__/noop.js',
    '^expo-image-picker$':               '<rootDir>/tests/__mocks__/image-picker.js',
    '^expo-location$':                   '<rootDir>/tests/__mocks__/expo-location.js',
    '^expo-task-manager$':               '<rootDir>/tests/__mocks__/noop.js',
    '^expo-notifications$':              '<rootDir>/tests/__mocks__/noop.js',
    '^expo-haptics$':                    '<rootDir>/tests/__mocks__/noop.js',
    '^expo-linear-gradient$':            '<rootDir>/tests/__mocks__/linear-gradient.js',
    // Navigation
    '^@react-native-community/netinfo$': '<rootDir>/tests/__mocks__/netinfo.ts',
    '^.*/navigation/navigationRef$':     '<rootDir>/tests/__mocks__/navigationRef.ts',
    '^@react-navigation/.*$':            '<rootDir>/tests/__mocks__/navigation.js',
    // Visual native packages
    '^react-native-maps$':               '<rootDir>/tests/__mocks__/maps.js',
    '^react-native-reanimated$':         '<rootDir>/tests/__mocks__/noop.js',
    '^react-native-gesture-handler$':    '<rootDir>/tests/__mocks__/noop.js',
    '^react-native-safe-area-context$':  '<rootDir>/tests/__mocks__/safe-area.js',
    '^react-native-screens$':            '<rootDir>/tests/__mocks__/noop.js',
    '^react-native-svg$':                '<rootDir>/tests/__mocks__/noop.js',
    '^@gorhom/bottom-sheet$':            '<rootDir>/tests/__mocks__/bottom-sheet.js',
    '^lucide-react-native$':             '<rootDir>/tests/__mocks__/lucide.js',
    '^socket.io-client$':                '<rootDir>/tests/__mocks__/noop.js',
    // Assets
    '\\.(jpg|jpeg|png|gif|svg|webp)$':   '<rootDir>/tests/__mocks__/fileMock.js',
  },
}
