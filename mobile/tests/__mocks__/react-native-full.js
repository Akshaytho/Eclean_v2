/**
 * Full react-native mock — includes all primitives RTLN needs.
 * View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
 * StyleSheet, ActivityIndicator, Alert, Image, Platform, etc.
 */
const React = require('react')

const View  = ({ children, testID, style, ...p }) =>
  React.createElement('View', { testID, style, ...p }, children)
const Text  = ({ children, testID, style, ...p }) =>
  React.createElement('Text', { testID, style, ...p }, children)
const Image = ({ testID, style, source, ...p }) =>
  React.createElement('Image', { testID, style, ...p })

const TextInput = React.forwardRef(({ testID, onChangeText, value, ...p }, ref) =>
  React.createElement('TextInput', {
    testID, value, ref,
    onChange: (e) => onChangeText && onChangeText(e.nativeEvent.text),
    ...p,
  })
)

const TouchableOpacity = ({ children, onPress, testID, disabled, ...p }) =>
  React.createElement('TouchableOpacity', { testID, disabled, onClick: disabled ? undefined : onPress, ...p }, children)

const TouchableHighlight = TouchableOpacity
const Pressable          = TouchableOpacity

const ScrollView = ({ children, testID, ...p }) =>
  React.createElement('ScrollView', { testID, ...p }, children)

const KeyboardAvoidingView = ({ children, ...p }) =>
  React.createElement(View, p, children)

const FlatList = ({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, testID }) => {
  const items = (data || []).map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index)
    return React.createElement(View, { key }, renderItem({ item, index }))
  })
  return React.createElement(View, { testID: testID || 'FlatList' },
    ListHeaderComponent ? React.createElement(View, { testID: 'list-header' }, ListHeaderComponent) : null,
    items.length > 0 ? items : (ListEmptyComponent ? React.createElement(View, null, ListEmptyComponent) : null),
  )
}

const ActivityIndicator = ({ testID }) =>
  React.createElement(View, { testID: testID || 'ActivityIndicator' })

const RefreshControl = () => null
const Modal          = ({ children, visible }) => visible ? React.createElement(View, { testID: 'Modal' }, children) : null
const SafeAreaView   = View

const StyleSheet = {
  create: (styles) => styles,
  flatten: (s)     => s,
  absoluteFill: {},
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
}

const Alert = {
  alert: jest.fn(),
}

const Dimensions = {
  get: jest.fn(() => ({ width: 375, height: 812 })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}

const Platform = { OS: 'ios', Version: '17', select: (obj) => obj.ios ?? obj.default }

const NativeModules = {}
const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}

const Animated = {
  Value: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn(), setValue: jest.fn() })),
  View,
  Text,
  createAnimatedComponent: (c) => c,
  timing: jest.fn(() => ({ start: jest.fn() })),
  spring: jest.fn(() => ({ start: jest.fn() })),
  parallel: jest.fn(() => ({ start: jest.fn() })),
}

const Keyboard = { dismiss: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) }

const Linking = { openURL: jest.fn(), openSettings: jest.fn() }

module.exports = {
  View, Text, Image, TextInput, TouchableOpacity, TouchableHighlight, Pressable,
  ScrollView, KeyboardAvoidingView, FlatList, ActivityIndicator, RefreshControl,
  Modal, SafeAreaView, StyleSheet, Alert, Dimensions, Platform, NativeModules,
  AppState, Animated, Keyboard, Linking,
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 375, height: 812 }),
}

// Tell babel interop this is already an ES module — prevents wrapping in {default: ...}
module.exports.__esModule = true
