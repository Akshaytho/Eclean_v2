import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import { Alert, Linking, Platform } from 'react-native'

// Request foreground location — required before any GPS use
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert(
      'Location Required',
      'eClean needs your location to show nearby tasks. Please enable location in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    )
    return false
  }
  return true
}

// Request background location — needed for GPS tracking when phone is locked
// Must be called AFTER foreground permission is granted
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync()
  return status === 'granted'
}

// Request push notification permission — call after login, not on startup
export async function requestPushPermission(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0A2463',
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  const token = await Notifications.getExpoPushTokenAsync()
  return token.data // ExponentPushToken[xxxx]
}
