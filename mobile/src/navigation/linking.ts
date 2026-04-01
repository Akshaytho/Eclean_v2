/**
 * Deep linking configuration for eclean:// scheme.
 * Handles: eclean://reset-password?token=xxx
 *
 * Setup: Add scheme "eclean" to app.json → expo.scheme
 */

import type { LinkingOptions } from '@react-navigation/native'
import * as Linking from 'expo-linking'

const prefix = Linking.createURL('/')

export const linking: LinkingOptions<any> = {
  prefixes: [prefix, 'eclean://'],
  config: {
    screens: {
      Auth: {
        screens: {
          ForgotPassword: 'reset-password',
        },
      },
    },
  },
}
