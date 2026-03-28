import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, PlusCircle, ClipboardList, LayoutDashboard } from 'lucide-react-native'

import { BUYER_THEME as B }    from '../constants/buyerTheme'
import type { BuyerTabParamList, BuyerStackParamList } from './types'

import { BuyerHomeScreen }        from '../screens/buyer/BuyerHomeScreen'
import { PostTaskScreen }          from '../screens/buyer/PostTaskScreen'
import { BuyerTasksScreen }        from '../screens/buyer/BuyerTasksScreen'
import { BuyerTaskDetailScreen }   from '../screens/buyer/BuyerTaskDetailScreen'
import { BuyerDashboardScreen }    from '../screens/buyer/BuyerDashboardScreen'
import { LiveTrackScreen }         from '../screens/buyer/LiveTrackScreen'
import { RatingScreen }            from '../screens/buyer/RatingScreen'
import { NotificationsScreen }     from '../screens/shared/NotificationsScreen'
import { ChatScreen }              from '../screens/shared/ChatScreen'
import { GalleryScreen }           from '../screens/shared/GalleryScreen'

const Tab   = createBottomTabNavigator<BuyerTabParamList>()
const Stack = createNativeStackNavigator<BuyerStackParamList>()

function BuyerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   B.tab.active,
        tabBarInactiveTintColor: B.tab.inactive,
        tabBarStyle: {
          backgroundColor: B.tab.background,
          borderTopColor:  B.tab.border,
          paddingBottom:   4,
          height:          60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const props = { color, size: size - 2 }
          if (route.name === 'BuyerHome')     return <Home {...props} />
          if (route.name === 'PostTask')       return <PlusCircle {...props} />
          if (route.name === 'BuyerTasks')    return <ClipboardList {...props} />
          if (route.name === 'Dashboard')     return <LayoutDashboard {...props} />
        },
      })}
    >
      <Tab.Screen name="BuyerHome"     component={BuyerHomeScreen}      options={{ title: 'Home' }} />
      <Tab.Screen name="PostTask"      component={PostTaskScreen}        options={{ title: 'Post Task' }} />
      <Tab.Screen name="BuyerTasks"    component={BuyerTasksScreen}     options={{ title: 'My Tasks' }} />
      <Tab.Screen name="Dashboard"     component={BuyerDashboardScreen} options={{ title: 'Dashboard' }} />
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
      <Stack.Screen name="Gallery"          component={GalleryScreen} />
      <Stack.Screen name="Notifications"   component={NotificationsScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  )
}
