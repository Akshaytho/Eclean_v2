import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, Search, ClipboardList, LayoutDashboard } from 'lucide-react-native'

import { WORKER_THEME as W } from '../constants/workerTheme'
import type { WorkerTabParamList, WorkerStackParamList } from './types'

import { WorkerHomeScreen }     from '../screens/worker/WorkerHomeScreen'
import { FindWorkScreen }       from '../screens/worker/FindWorkScreen'
import { MyTasksScreen }        from '../screens/worker/MyTasksScreen'
import { WorkerDashboardScreen } from '../screens/worker/WorkerDashboardScreen'
import { TaskDetailScreen }     from '../screens/worker/TaskDetailScreen'
import { ActiveTaskScreen }     from '../screens/worker/ActiveTaskScreen'
import { SubmitProofScreen }    from '../screens/worker/SubmitProofScreen'
import { WalletScreen }         from '../screens/worker/WalletScreen'
import { ChatScreen }           from '../screens/shared/ChatScreen'
import { GalleryScreen }        from '../screens/shared/GalleryScreen'
import { NotificationsScreen }  from '../screens/shared/NotificationsScreen'

const Tab   = createBottomTabNavigator<WorkerTabParamList>()
const Stack = createNativeStackNavigator<WorkerStackParamList>()

function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   W.tab.active,
        tabBarInactiveTintColor: W.tab.inactive,
        tabBarStyle: {
          backgroundColor: W.tab.background,
          borderTopColor:  W.tab.border,
          paddingBottom:   4,
          height:          60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ color, size }) => {
          const props = { color, size: size - 2 }
          if (route.name === 'WorkerHome') return <Home {...props} />
          if (route.name === 'FindWork')   return <Search {...props} />
          if (route.name === 'MyTasks')    return <ClipboardList {...props} />
          if (route.name === 'Dashboard')  return <LayoutDashboard {...props} />
        },
      })}
    >
      <Tab.Screen name="WorkerHome" component={WorkerHomeScreen}      options={{ title: 'Home' }} />
      <Tab.Screen name="FindWork"   component={FindWorkScreen}        options={{ title: 'Find Work' }} />
      <Tab.Screen name="MyTasks"    component={MyTasksScreen}         options={{ title: 'My Tasks' }} />
      <Tab.Screen name="Dashboard"  component={WorkerDashboardScreen} options={{ title: 'Dashboard' }} />
    </Tab.Navigator>
  )
}

export function WorkerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkerTabs"    component={WorkerTabs} />
      <Stack.Screen name="TaskDetail"    component={TaskDetailScreen}    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ActiveTask"    component={ActiveTaskScreen}    options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="SubmitProof"   component={SubmitProofScreen}   options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Chat"          component={ChatScreen}          options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Gallery"       component={GalleryScreen}       options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Wallet"        component={WalletScreen}        options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  )
}
