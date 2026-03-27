const { View } = require('./react-native-full')
module.exports = {
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}
