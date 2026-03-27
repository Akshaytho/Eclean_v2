// Root navigator — decides which stack to show based on auth state + role.
// Splash screen handles the initial token check; after that, this component
// reacts to useAuthStore changes and renders the correct navigator.

import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { useAuthStore }       from '../stores/authStore'
import { COLORS }             from '../constants/colors'
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
        <Stack.Screen name="WorkerStack" component={WorkerNavigator} />
      ) : user.role === 'BUYER' ? (
        <Stack.Screen name="BuyerStack" component={BuyerNavigator} />
      ) : user.role === 'SUPERVISOR' ? (
        <Stack.Screen name="SupervisorStack" component={SupervisorNavigator} />
      ) : (
        // CITIZEN and ADMIN both fall into CitizenStack for now
        <Stack.Screen name="CitizenStack" component={CitizenNavigator} />
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
