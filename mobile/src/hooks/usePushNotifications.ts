// Request push permission AFTER login (better opt-in rate than on launch).
// Saves Expo push token to backend via POST /api/v1/notifications/device-token.

import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

import { notificationsApi } from '../api/notifications.api'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

export function usePushNotifications() {
  useEffect(() => {
    registerForPushNotifications()
  }, [])
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
