import React, { Component } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface Props { children: React.ReactNode; label?: string }
interface State { hasError: boolean; error: string }

export class NavigatorErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.title}>Something went wrong</Text>
          {this.props.label && <Text style={s.label}>{this.props.label}</Text>}
          <Text style={s.message}>{this.state.error}</Text>
          <TouchableOpacity
            style={s.button}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={s.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}

const s = StyleSheet.create({
  container:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title:      { fontSize: 20, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  label:      { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  message:    { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 24, fontFamily: 'monospace' },
  button:     { backgroundColor: '#2E8B57', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
