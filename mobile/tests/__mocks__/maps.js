const React = require('react')
const { View } = require('./react-native.ts')
const fwd = React.forwardRef
const MapView = fwd((p, ref) => React.createElement(View, { testID: 'MapView', ref, ...p }))
const Marker   = (p) => React.createElement(View, { testID: 'Marker',   ...p })
const Polyline = (p) => React.createElement(View, { testID: 'Polyline', ...p })
const Circle   = (p) => React.createElement(View, { testID: 'Circle',   ...p })
module.exports = { __esModule: true, default: MapView, Marker, Polyline, Circle }
