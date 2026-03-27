const React = require('react')
const EmptyView = ({ children, ...p }) => React.createElement('View', p, children)
EmptyView.Marker   = EmptyView
EmptyView.Polyline = EmptyView
EmptyView.Circle   = EmptyView
EmptyView.Callout  = EmptyView
module.exports = { __esModule: true, default: EmptyView, ...EmptyView }
