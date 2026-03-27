import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, PlusCircle, ClipboardList, Bell, User } from 'lucide-react-native'

import { COLORS }              from '../constants/colors'
import type { BuyerTabParamList, BuyerStackParamList } from './types'

import { BuyerHomeScreen }        from '../screens/buyer/BuyerHomeScreen'
import { PostTaskScreen }          from '../screens/buyer/PostTaskScreen'
import { BuyerTasksScreen }        from '../screens/buyer/BuyerTasksScreen'
import { BuyerTaskDetailScreen }   from '../screens/buyer/BuyerTaskDetailScreen'
import { LiveTrackScreen }         from '../screens/buyer/LiveTrackScreen'
import { RatingScreen }            from '../screens/buyer/RatingScreen'
import { NotificationsScreen }     from '../screens/shared/NotificationsScreen'
import { ProfileScreen }           from '../screens/shared/ProfileScreen'
import { ChatScreen }              from '../screens/shared/ChatScreen'

const Tab   = createBottomTabNavigator<BuyerTabParamList>()
const Stack = createNativeStackNavigator<BuyerStackParamList>()

function BuyerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   COLORS.brand.primary,
        tabBarInactiveTintColor: COLORS.neutral[400],
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor:  COLORS.border,
          paddingBottom:   4,
          height:          60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const props = { color, size: size - 2 }
          if (route.name === 'BuyerHome')     return <Home {...props} />
          if (route.name === 'PostTask')       return <PlusCircle {...props} />
          if (route.name === 'BuyerTasks')    return <ClipboardList {...props} />
          if (route.name === 'Notifications') return <Bell {...props} />
          if (route.name === 'Profile')       return <User {...props} />
        },
      })}
    >
      <Tab.Screen name="BuyerHome"     component={BuyerHomeScreen}     options={{ title: 'Home' }} />
      <Tab.Screen name="PostTask"      component={PostTaskScreen}       options={{ title: 'Post Task' }} />
      <Tab.Screen name="BuyerTasks"   component={BuyerTasksScreen}    options={{ title: 'My Tasks' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Alerts' }} />
      <Tab.Screen name="Profile"       component={ProfileScreen}       options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export function BuyerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BuyerTabs"        component={BuyerTabs} />
      <Stack.Screen name="BuyerTaskDetail"  component={BuyerTaskDetailScreen} />
      <Stack.Screen name="LiveTrack"        component={LiveTrackScreen} />
      <Stack.Screen name="Rating"           component={RatingScreen} />
      <Stack.Screen name="Chat"             component={ChatScreen} />
    </Stack.Navigator>
  )
}
