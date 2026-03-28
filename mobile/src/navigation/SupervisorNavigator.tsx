import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs'
import { Map, Bell, User }            from 'lucide-react-native'
import { COLORS }                     from '../constants/colors'
import type { SupervisorTabParamList, SupervisorStackParamList } from './types'
import { SupervisorHomeScreen } from '../screens/supervisor/SupervisorHomeScreen'
import { ZoneDetailScreen }     from '../screens/supervisor/ZoneDetailScreen'
import { InspectZoneScreen }    from '../screens/supervisor/InspectZoneScreen'
import { NotificationsScreen }  from '../screens/shared/NotificationsScreen'
import { ProfileScreen }        from '../screens/shared/ProfileScreen'

const Tab   = createBottomTabNavigator<SupervisorTabParamList>()
const Stack = createNativeStackNavigator<SupervisorStackParamList>()

function SupervisorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   COLORS.brand.primary,
        tabBarInactiveTintColor: COLORS.neutral[400],
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: 4, height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const p = { color, size: size - 2 }
          if (route.name === 'SupervisorHome') return <Map {...p} />
          if (route.name === 'Notifications')  return <Bell {...p} />
          if (route.name === 'Profile')        return <User {...p} />
        },
      })}
    >
      <Tab.Screen name="SupervisorHome" component={SupervisorHomeScreen} options={{ title: 'Zones' }} />
      <Tab.Screen name="Notifications"  component={NotificationsScreen}  options={{ title: 'Alerts' }} />
      <Tab.Screen name="Profile"        component={ProfileScreen}        options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export function SupervisorNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SupervisorTabs" component={SupervisorTabs} />
      <Stack.Screen name="ZoneDetail"     component={ZoneDetailScreen} />
      <Stack.Screen name="InspectZone"    component={InspectZoneScreen} />
    </Stack.Navigator>
  )
}
