const React = require('react')
const { View, ScrollView } = require('./react-native-full')
const BottomSheet = React.forwardRef(({ children, ...p }, ref) => {
  React.useImperativeHandle(ref, () => ({ snapToIndex: jest.fn(), close: jest.fn() }))
  return React.createElement(View, { testID: 'BottomSheet', ...p }, children)
})
const BottomSheetFlatList = ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ...p }) => {
  const items = (data || []).map((item, i) => renderItem({ item, index: i }))
  return React.createElement(View, { testID: 'BottomSheetFlatList' },
    ListHeaderComponent ? React.createElement(View, null, ListHeaderComponent) : null,
    items.length ? items : (ListEmptyComponent ? React.createElement(View, null, ListEmptyComponent) : null)
  )
}
module.exports = { __esModule: true, default: BottomSheet, BottomSheetFlatList }
