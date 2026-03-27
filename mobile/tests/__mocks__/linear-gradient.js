const React = require('react')
module.exports = {
  LinearGradient: ({ children, colors, ...p }) => React.createElement('View', p, children)
}
