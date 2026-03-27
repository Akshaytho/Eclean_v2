// eClean — Firebase Cloud Messaging (push notifications)
// Dev mode: logs to console when FIREBASE_SERVICE_ACCOUNT_JSON is not set.

import * as admin from 'firebase-admin'
import { env } from '../config/env'
import { prisma } from './prisma'
import { logger } from './logger'

// ─── Lazy init ────────────────────────────────────────────────────────────────

let _initialized = false

function getMessaging(): admin.messaging.Messaging | null {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return null

  if (!_initialized) {
    try {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount
      // Guard against re-init across hot-reloads (tsx watch)
      if (admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
      }
      _initialized = true
    } catch (err) {
      logger.error({ err }, 'Firebase Admin init failed')
      return null
    }
  }

  return admin.messaging()
}

// ─── sendPush ─────────────────────────────────────────────────────────────────

export async function sendPush(
  userId: string,
  title:  string,
  body:   string,
  data?:  Record<string, string>,
): Promise<void> {
  const messaging = getMessaging()

  if (!messaging) {
    console.log(`[DEV PUSH] userId=${userId} title="${title}" body="${body}"`)
    return
  }

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { deviceToken: true },
  })

  if (!user?.deviceToken) return

  try {
    await messaging.send({
      token:        user.deviceToken,
      notification: { title, body },
      ...(data && { data }),
    })
    logger.debug({ userId }, 'Push notification sent')
  } catch (err) {
    // Log but never throw — push failures must not surface to callers
    logger.error({ userId, err }, 'sendPush failed')
  }
}
