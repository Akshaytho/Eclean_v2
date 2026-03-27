const React = require('react')
module.exports = {
  useNavigation:   () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popToTop: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute:        () => ({ params: {} }),
  useFocusEffect:  jest.fn(),
  NavigationContainer: ({ children }) => children,
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ component: C, ...p }) => React.createElement(C, {}),
  }),
  createBottomTabNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ component: C, ...p }) => React.createElement(C, {}),
  }),
}
