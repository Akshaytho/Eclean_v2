const React = require('react')
const Icon = (p) => React.createElement('View', { testID: 'icon', ...p })
module.exports = new Proxy({}, { get: () => Icon })
