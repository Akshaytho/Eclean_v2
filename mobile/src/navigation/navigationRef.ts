// eClean navigation ref
// Allows navigation from outside React components (e.g. api/client.ts on 401).
// Import `navigationRef` and call `navigationRef.current?.navigate(...)`.

import { createNavigationContainerRef } from '@react-navigation/native'
import type { RootStackParamList } from './types'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

export function navigateToAuth(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Auth')
  }
}
