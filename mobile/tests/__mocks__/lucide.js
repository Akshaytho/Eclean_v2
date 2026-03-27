const React = require('react')
const { View } = require('./react-native-full')
const Icon = (p) => React.createElement(View, { testID: 'icon', ...p })
module.exports = new Proxy({}, { get: () => Icon })
