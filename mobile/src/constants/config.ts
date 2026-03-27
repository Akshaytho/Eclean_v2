import Constants from 'expo-constants'

// During Maestro testing, swap this to 'http://localhost:3000'
// For development on device, use your local IP: 'http://192.168.x.x:3000'
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ?? 'https://ecleanfuture-production.up.railway.app'

export const SOCKET_URL = API_URL

export const GPS_TASK_NAME = 'eclean-background-location'

export const GEOFENCE_RADIUS_KM = 2

export const GPS_INTERVAL_MS = 15_000    // 15 seconds
export const GPS_DISTANCE_M  = 10        // or every 10 meters

export const CHAT_PAGE_SIZE  = 50
export const TASK_PAGE_SIZE  = 20

export const TOKEN_REFRESH_BUFFER_MS = 60_000 // refresh 60s before expiry
