// eClean Mobile — App entry point
//
// Import backgroundLocation FIRST (before NavigationContainer) so expo-task-manager
// can register the GPS task before the OS potentially needs it on cold start.
import './src/services/backgroundLocation'

import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StyleSheet } from 'react-native'

import { navigationRef }   from './src/navigation/navigationRef'
import { RootNavigator }   from './src/navigation/RootNavigator'
import { useAuthStore }    from './src/stores/authStore'
import { useSocketStore }  from './src/stores/socketStore'
import { getTokens }       from './src/stores/authStore'
import { authApi }         from './src/api/auth.api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry:     2,
    },
  },
})

export default function App() {
  const { setUser, setLoading, logout } = useAuthStore()
  const { connect } = useSocketStore()

  // On launch: check stored tokens → fetch /auth/me → hydrate user
  useEffect(() => {
    async function bootstrap() {
      try {
        const { accessToken } = await getTokens()
        if (!accessToken) {
          setLoading(false)
          return
        }

        const user = await authApi.me()
        setUser(user)
        connect(accessToken)
      } catch {
        // Token invalid or expired and refresh failed
        await logout()
      }
    }

    bootstrap()
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
