// Root navigator — decides which stack to show based on auth state + role.
// Splash screen handles the initial token check; after that, this component
// reacts to useAuthStore changes and renders the correct navigator.

import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAuthStore }       from '../stores/authStore'
import { COLORS }             from '../constants/colors'
import { NavigatorErrorBoundary } from '../components/NavigatorErrorBoundary'
import type { RootStackParamList } from './types'

// Auth screens
import { SplashScreen }       from '../screens/auth/SplashScreen'
import { OnboardingScreen }   from '../screens/auth/OnboardingScreen'
import { LoginScreen }        from '../screens/auth/LoginScreen'
import { RegisterScreen }     from '../screens/auth/RegisterScreen'
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen'

// Role navigators
import { WorkerNavigator }     from './WorkerNavigator'
import { BuyerNavigator }      from './BuyerNavigator'
import { SupervisorNavigator } from './SupervisorNavigator'
import { CitizenNavigator }    from './CitizenNavigator'

const Stack = createNativeStackNavigator<RootStackParamList>()

// PERF: stable component references — inline arrow functions in <Stack.Screen> cause
// React Navigation to remount the ENTIRE navigator tree on every parent re-render.
// On a ₹3000 phone, this adds 200-400ms per state change (auth check, tab switch).
function WorkerScreen()     { return <NavigatorErrorBoundary label="Worker"><WorkerNavigator /></NavigatorErrorBoundary> }
function BuyerScreen()      { return <NavigatorErrorBoundary label="Buyer"><BuyerNavigator /></NavigatorErrorBoundary> }
function SupervisorScreen() { return <NavigatorErrorBoundary label="Supervisor"><SupervisorNavigator /></NavigatorErrorBoundary> }
function CitizenScreen()    { return <NavigatorErrorBoundary label="Citizen"><CitizenNavigator /></NavigatorErrorBoundary> }

// Auth sub-stack (Splash → Onboarding → Login → Register → ForgotPassword)
function AuthStack() {
  // Use a separate param list for the auth sub-flow
  type AuthParams = {
    Splash:         undefined
    Onboarding:     undefined
    Login:          undefined
    Register:       undefined
    ForgotPassword: undefined
  }
  const AuthNav = createNativeStackNavigator<AuthParams>()
  return (
    <AuthNav.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthNav.Screen name="Splash"         component={SplashScreen} />
      <AuthNav.Screen name="Onboarding"     component={OnboardingScreen} />
      <AuthNav.Screen name="Login"          component={LoginScreen} />
      <AuthNav.Screen name="Register"       component={RegisterScreen} />
      <AuthNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthNav.Navigator>
  )
}

export function RootNavigator() {
  const { isLoading, isLoggedIn, user } = useAuthStore()

  // While checking stored tokens on launch
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brand.primary} />
      </View>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isLoggedIn || !user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : user.role === 'WORKER' ? (
        <Stack.Screen name="WorkerStack" component={WorkerScreen} />
      ) : user.role === 'BUYER' ? (
        <Stack.Screen name="BuyerStack" component={BuyerScreen} />
      ) : user.role === 'SUPERVISOR' ? (
        <Stack.Screen name="SupervisorStack" component={SupervisorScreen} />
      ) : (
        <Stack.Screen name="CitizenStack" component={CitizenScreen} />
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
})
