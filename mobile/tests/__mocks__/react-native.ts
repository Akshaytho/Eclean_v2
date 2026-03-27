/**
 * React Native mock — works for unit tests (API/stores) AND screen tests.
 * TouchableOpacity fires onPress on fireEvent.press from @testing-library/react-native.
 */
import React from 'react'

export const View = ({ children, ...p }: any) => React.createElement('View', p, children)
export const Text = ({ children, ...p }: any) => React.createElement('Text', p, children)
export const Image = ({ ...p }: any) => React.createElement('Image', p)

export const TextInput = React.forwardRef(({ onChangeText, ...p }: any, ref: any) =>
  React.createElement('TextInput', {
    ...p, ref,
    // RTLN fireEvent.changeText fires onChange with { nativeEvent: { text } }
    onChange: (e: any) => onChangeText?.(e.nativeEvent?.text ?? e),
  })
)

// CRITICAL: keep onPress as onPress — fireEvent.press looks for onPress
export const TouchableOpacity = ({ children, onPress, disabled, ...p }: any) =>
  React.createElement('TouchableOpacity', { onPress: disabled ? undefined : onPress, disabled, ...p }, children)

export const TouchableHighlight = TouchableOpacity
export const Pressable          = TouchableOpacity

export const ScrollView = ({ children, ...p }: any) =>
  React.createElement('ScrollView', p, children)

export const KeyboardAvoidingView = ({ children, ...p }: any) =>
  React.createElement('View', p, children)

export const SafeAreaView = ({ children, ...p }: any) =>
  React.createElement('View', p, children)

export const FlatList = ({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, testID, ...p }: any) => {
  const items = (data ?? []).map((item: any, index: number) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index)
    return React.createElement(View, { key }, renderItem({ item, index }))
  })
  return React.createElement(View, { testID: testID ?? 'FlatList' },
    ListHeaderComponent ? React.createElement(View, { testID: 'list-header' }, ListHeaderComponent) : null,
    items.length > 0 ? items : (ListEmptyComponent ? React.createElement(View, { testID: 'list-empty' }, ListEmptyComponent) : null),
  )
}

export const SectionList = FlatList

export const ActivityIndicator = ({ testID, ...p }: any) =>
  React.createElement('View', { testID: testID ?? 'ActivityIndicator', ...p })

export const RefreshControl = () => null
export const Modal = ({ children, visible, testID }: any) =>
  visible ? React.createElement(View, { testID: testID ?? 'Modal' }, children) : null

export const StyleSheet = {
  create: (s: any) => s,
  flatten: (s: any) => s,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  hairlineWidth: 1,
}

export const Alert = { alert: jest.fn() }

export const Dimensions = {
  get: jest.fn(() => ({ width: 375, height: 812, scale: 2, fontScale: 1 })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}

export const Platform = {
  OS: 'ios' as const,
  Version: '17',
  select: (obj: any) => obj.ios ?? obj.default,
}

export const Keyboard = {
  dismiss: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
}

export const Linking = {
  openURL: jest.fn(),
  openSettings: jest.fn(),
  canOpenURL: jest.fn().mockResolvedValue(true),
}

export const Animated = {
  Value: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn(), setValue: jest.fn(), interpolate: jest.fn() })),
  View,
  Text,
  createAnimatedComponent: (c: any) => c,
  timing: jest.fn(() => ({ start: jest.fn() })),
  spring: jest.fn(() => ({ start: jest.fn() })),
  parallel: jest.fn(() => ({ start: jest.fn() })),
  sequence: jest.fn(() => ({ start: jest.fn() })),
  loop: jest.fn(() => ({ start: jest.fn() })),
}

export const NativeModules = {}

export const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}

export const Vibration = { vibrate: jest.fn(), cancel: jest.fn() }
export const Share     = { share: jest.fn().mockResolvedValue({ action: 'sharedAction' }) }
export const Clipboard = { setString: jest.fn(), getString: jest.fn().mockResolvedValue('') }

export const useColorScheme      = () => 'light'
export const useWindowDimensions = () => ({ width: 375, height: 812 })
