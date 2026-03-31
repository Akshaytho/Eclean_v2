import React, { lazy, Suspense } from 'react'
import { ActivityIndicator, View, Platform } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Home, Search, ClipboardList, LayoutDashboard } from 'lucide-react-native'

import { WORKER_THEME as W } from '../constants/workerTheme'
import type { WorkerTabParamList, WorkerStackParamList } from './types'

// Tab screens — loaded eagerly
import { WorkerHomeScreen }     from '../screens/worker/WorkerHomeScreen'
import { FindWorkScreen }       from '../screens/worker/FindWorkScreen'
import { MyTasksScreen }        from '../screens/worker/MyTasksScreen'
import { WorkerDashboardScreen } from '../screens/worker/WorkerDashboardScreen'

// Stack screens — lazy loaded
const TaskDetailScreen   = lazy(() => import('../screens/worker/TaskDetailScreen').then(m => ({ default: m.TaskDetailScreen })))
const ActiveTaskScreen   = lazy(() => import('../screens/worker/ActiveTaskScreen').then(m => ({ default: m.ActiveTaskScreen })))
const SubmitProofScreen     = lazy(() => import('../screens/worker/SubmitProofScreen').then(m => ({ default: m.SubmitProofScreen })))
const ReferencePointScreen = lazy(() => import('../screens/worker/ReferencePointNavigator').then(m => ({ default: m.ReferencePointNavigator })))
const WalletScreen       = lazy(() => import('../screens/worker/WalletScreen').then(m => ({ default: m.WalletScreen })))
const ChatScreen         = lazy(() => import('../screens/shared/ChatScreen').then(m => ({ default: m.ChatScreen })))
const GalleryScreen      = lazy(() => import('../screens/shared/GalleryScreen').then(m => ({ default: m.GalleryScreen })))
const NotificationsScreen = lazy(() => import('../screens/shared/NotificationsScreen').then(m => ({ default: m.NotificationsScreen })))
const PostSubmissionScreen = lazy(() => import('../screens/worker/PostSubmissionScreen').then(m => ({ default: m.PostSubmissionScreen })))
const ReportIssueScreen = lazy(() => import('../screens/worker/ReportIssueScreen').then(m => ({ default: m.ReportIssueScreen })))

function LazyFallback() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: W.background }}>
    <ActivityIndicator color={W.primary} size="small" />
  </View>
}

function withSuspense<P extends object>(LazyComponent: React.LazyExoticComponent<React.ComponentType<P>>) {
  return function SuspenseWrapper(props: P) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

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
          paddingBottom:   Platform.OS === 'android' ? 8 : 4,
          height:          Platform.OS === 'android' ? 64 : 60,
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
      <Stack.Screen name="TaskDetail"    component={withSuspense(TaskDetailScreen)}    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ActiveTask"      component={withSuspense(ActiveTaskScreen)}      options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      <Stack.Screen name="ReferencePoints" component={withSuspense(ReferencePointScreen)} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SubmitProof"     component={withSuspense(SubmitProofScreen)}     options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Chat"          component={withSuspense(ChatScreen)}          options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Gallery"       component={withSuspense(GalleryScreen)}       options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Wallet"        component={withSuspense(WalletScreen)}        options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Notifications"   component={withSuspense(NotificationsScreen)}  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="PostSubmission"   component={withSuspense(PostSubmissionScreen)} options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
      <Stack.Screen name="ReportIssue"      component={withSuspense(ReportIssueScreen)}    options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  )
}
