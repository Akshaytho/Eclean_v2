import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs'
import { Home, Bell, User }           from 'lucide-react-native'
import { COLORS }                     from '../constants/colors'
import type { CitizenTabParamList, CitizenStackParamList } from './types'
import { CitizenHomeScreen }   from '../screens/citizen/CitizenHomeScreen'
import { CreateReportScreen }  from '../screens/citizen/CreateReportScreen'
import { NotificationsScreen } from '../screens/shared/NotificationsScreen'
import { ProfileScreen }       from '../screens/shared/ProfileScreen'



const Tab   = createBottomTabNavigator<CitizenTabParamList>()
const Stack = createNativeStackNavigator<CitizenStackParamList>()

function CitizenTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   COLORS.brand.primary,
        tabBarInactiveTintColor: COLORS.neutral[400],
        tabBarStyle:             { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: 4, height: 60 },
        tabBarLabelStyle:        { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const p = { color, size: size - 2 }
          if (route.name === 'CitizenHome')   return <Home {...p} />
          if (route.name === 'Notifications') return <Bell {...p} />
          if (route.name === 'Profile')       return <User {...p} />
        },
      })}
    >
      <Tab.Screen name="CitizenHome"   component={CitizenHomeScreen}   options={{ title: 'Home' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Alerts' }} />
      <Tab.Screen name="Profile"       component={ProfileScreen}       options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export function CitizenNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CitizenTabs"   component={CitizenTabs} />
      <Stack.Screen name="CreateReport"  component={CreateReportScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  )
}
