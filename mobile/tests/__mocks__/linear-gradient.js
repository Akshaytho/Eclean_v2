const React = require('react')
const { View } = require('./react-native.ts')
module.exports = { LinearGradient: ({ children, colors, ...p }) => React.createElement(View, p, children) }
