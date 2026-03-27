module.exports = {
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView:     ({ children, ...p }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}
