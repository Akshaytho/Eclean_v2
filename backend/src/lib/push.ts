// eClean — Push notifications via Expo Push API
// Replaces firebase-admin. Expo handles APNs (iOS) and FCM (Android) transparently.
// No SDK needed — one fetch call to https://exp.host/--/api/v2/push/send

import { prisma } from './prisma'
import { logger } from './logger'

interface ExpoPushMessage {
  to:    string
  title: string
  body:  string
  data?: Record<string, string>
  sound?: 'default'
}

interface ExpoPushTicket {
  status:  'ok' | 'error'
  id?:     string
  message?: string
  details?: { error?: string }
}

// ─── sendPush ─────────────────────────────────────────────────────────────────

export async function sendPush(
  userId: string,
  title:  string,
  body:   string,
  data?:  Record<string, string>,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { deviceToken: true },
  })

  if (!user?.deviceToken) {
    logger.debug({ userId }, 'No device token — skipping push')
    return
  }

  // Expo push tokens look like ExponentPushToken[xxxx]
  // If still a Firebase FCM token (legacy), skip silently — mobile will re-register
  if (!user.deviceToken.startsWith('ExponentPushToken')) {
    logger.debug({ userId }, 'Non-Expo token on record — skipping push (will update on next login)')
    return
  }

  const message: ExpoPushMessage = {
    to:    user.deviceToken,
    title,
    body,
    sound: 'default',
    ...(data && { data }),
  }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!res.ok) {
      logger.error({ userId, status: res.status }, 'Expo push API HTTP error')
      return
    }

    const json = await res.json() as { data: ExpoPushTicket }
    const ticket = json.data

    if (ticket.status === 'error') {
      logger.error({ userId, error: ticket.message, details: ticket.details }, 'Expo push ticket error')
    } else {
      logger.debug({ userId, ticketId: ticket.id }, 'Push notification sent')
    }
  } catch (err) {
    // Never throw — push failures must not surface to callers
    logger.error({ userId, err }, 'sendPush failed')
  }
}
