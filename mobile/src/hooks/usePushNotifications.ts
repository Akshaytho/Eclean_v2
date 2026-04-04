// Request push permission AFTER login (better opt-in rate than on launch).
// Saves Expo push token to backend via POST /api/v1/notifications/device-token.
// Also handles notification tap → deep navigation via navigationRef.

import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

import { notificationsApi } from '../api/notifications.api'
import { navigationRef } from '../navigation/navigationRef'
import { useAuthStore } from '../stores/authStore'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  } as Notifications.NotificationBehavior),
})

/** Route user to the correct screen based on role + notification data. */
function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  role: string | undefined,
) {
  const data = response.notification.request.content.data as
    | { taskId?: string; type?: string }
    | undefined

  const taskId = data?.taskId
  if (!taskId || !navigationRef.isReady()) return

  if (role === 'WORKER') {
    (navigationRef as any).navigate('WorkerStack', {
      screen: 'ActiveTask',
      params: { taskId },
    })
  } else if (role === 'BUYER') {
    (navigationRef as any).navigate('BuyerStack', {
      screen: 'BuyerTaskDetail',
      params: { taskId },
    })
  }
  // Other roles: app opens to their home screen automatically — no deep nav needed.
}

export function usePushNotifications() {
  const role = useAuthStore(s => s.user?.role)

  useEffect(() => {
    registerForPushNotifications()
  }, [])

  // Handle notification taps (background + app-killed scenarios)
  useEffect(() => {
    // App was killed → user tapped a notification to launch it
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationResponse(response, role)
    })

    // App is in background → user taps a notification
    const subscription = Notifications.addNotificationResponseReceivedListener(
      response => handleNotificationResponse(response, role),
    )

    return () => subscription.remove()
  }, [role])
}

async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return  // simulators cannot receive push

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:      'eClean',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data
    await notificationsApi.saveDeviceToken(token)
  } catch {
    // Token registration is non-critical — silently fail
  }
}
