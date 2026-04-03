module.exports = function (api) {
  api.cache(true)

  const plugins = []

  // SECURITY: strip console.log/warn/info in production builds
  // Prevents leaking GPS errors, queue state, compression info to debugger-attached devices
  if (process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production') {
    plugins.push(['transform-remove-console', { exclude: ['error'] }])
  }

  plugins.push('react-native-reanimated/plugin') // must be last

  return {
    presets: ['babel-preset-expo'],
    plugins,
  }
}
