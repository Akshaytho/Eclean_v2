/**
 * Unified notification helper — DB + Push + Socket in one call.
 *
 * Use this instead of bare prisma.notification.create() to ensure
 * notifications are delivered via all three channels:
 *   1. Database record (for in-app notification list)
 *   2. Expo Push (for phone notification when app is backgrounded)
 *   3. Socket.io (for real-time in-app delivery when app is open)
 */

import type { NotificationType, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { sendPush } from './push'
import { emitNotification } from '../realtime/socket'
import { logger } from './logger'

interface NotifyParams {
  userId: string
  type:   NotificationType
  title:  string
  body:   string
  data?:  Record<string, unknown>
}

/**
 * Create a notification record, send push, and emit socket event.
 * Safe to call from anywhere — push/socket failures are silently logged, never thrown.
 */
export async function notifyUser({ userId, type, title, body, data }: NotifyParams): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: { userId, type, title, body, data: (data ?? {}) as Prisma.InputJsonValue },
    })

    // Push notification (phone) — fire and forget
    void sendPush(userId, title, body, data ? Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ) : undefined)

    // Socket notification (real-time in-app) — fire and forget
    emitNotification(userId, { id: notification.id, type, title, body, data })
  } catch (err) {
    logger.error({ userId, type, err }, 'notifyUser failed')
  }
}
