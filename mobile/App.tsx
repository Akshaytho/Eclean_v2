// eClean Mobile — App entry point
//
// Import backgroundLocation FIRST (before NavigationContainer) so expo-task-manager
// can register the GPS task before the OS potentially needs it on cold start.
import './src/services/backgroundLocation'

import React, { useEffect, useState, Component } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

import { navigationRef }   from './src/navigation/navigationRef'
import { RootNavigator }   from './src/navigation/RootNavigator'
import { useAuthStore }    from './src/stores/authStore'
import { useSocketStore }  from './src/stores/socketStore'
import { getTokens }       from './src/stores/authStore'
import { authApi }         from './src/api/auth.api'

// Keep splash visible until bootstrap completes
SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry:     2,
    },
  },
})

// ─── Error Boundary ──────────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; error: string }

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>eClean crashed 😞</Text>
          <Text style={eb.message}>{this.state.error}</Text>
          <TouchableOpacity style={eb.button} onPress={() => this.setState({ hasError: false, error: '' })}>
            <Text style={eb.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title:     { fontSize: 22, fontWeight: '700', color: '#e53e3e', marginBottom: 12 },
  message:   { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24, fontFamily: 'monospace' },
  button:    { backgroundColor: '#2E8B57', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  buttonText:{ color: '#fff', fontWeight: '600', fontSize: 16 },
})
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const { setUser, setLoading, logout } = useAuthStore()
  const { connect } = useSocketStore()
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    async function bootstrap() {
      try {
        const { accessToken } = await getTokens()
        if (!accessToken) {
          setLoading(false)
        } else {
          const user = await authApi.me()
          setUser(user)
          connect(accessToken)
        }
      } catch {
        await logout()
      } finally {
        // Always hide splash — no matter what happened above
        setAppReady(true)
        await SplashScreen.hideAsync()
      }
    }

    bootstrap()
  }, [])

  if (!appReady) return null

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="auto" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
