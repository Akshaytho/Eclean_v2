import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, Search, ClipboardList, Wallet, User } from 'lucide-react-native'

import { COLORS } from '../constants/colors'
import type { WorkerTabParamList, WorkerStackParamList } from './types'

import { WorkerHomeScreen }  from '../screens/worker/WorkerHomeScreen'
import { FindWorkScreen }    from '../screens/worker/FindWorkScreen'
import { MyTasksScreen }     from '../screens/worker/MyTasksScreen'
import { WalletScreen }      from '../screens/worker/WalletScreen'
import { ProfileScreen }     from '../screens/shared/ProfileScreen'
import { TaskDetailScreen }  from '../screens/worker/TaskDetailScreen'
import { ActiveTaskScreen }  from '../screens/worker/ActiveTaskScreen'
import { SubmitProofScreen } from '../screens/worker/SubmitProofScreen'

const Tab   = createBottomTabNavigator<WorkerTabParamList>()
const Stack = createNativeStackNavigator<WorkerStackParamList>()

function WorkerTabs() {
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
          if (route.name === 'WorkerHome') return <Home {...props} />
          if (route.name === 'FindWork')   return <Search {...props} />
          if (route.name === 'MyTasks')    return <ClipboardList {...props} />
          if (route.name === 'Wallet')     return <Wallet {...props} />
          if (route.name === 'Profile')    return <User {...props} />
        },
      })}
    >
      <Tab.Screen name="WorkerHome" component={WorkerHomeScreen}  options={{ title: 'Home' }} />
      <Tab.Screen name="FindWork"   component={FindWorkScreen}    options={{ title: 'Find Work' }} />
      <Tab.Screen name="MyTasks"    component={MyTasksScreen}     options={{ title: 'My Tasks' }} />
      <Tab.Screen name="Wallet"     component={WalletScreen}      options={{ title: 'Wallet' }} />
      <Tab.Screen name="Profile"    component={ProfileScreen}     options={{ title: 'Profile' }} />
    </Tab.Navigator>
  )
}

export function WorkerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkerTabs"  component={WorkerTabs} />
      <Stack.Screen name="TaskDetail"  component={TaskDetailScreen}  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ActiveTask"  component={ActiveTaskScreen}  options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="SubmitProof" component={SubmitProofScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  )
}
