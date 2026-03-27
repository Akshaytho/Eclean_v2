import { prisma } from '../../lib/prisma'
import { NotFoundError, ForbiddenError } from '../../lib/errors'

const PAGE_SIZE = 20

export async function saveDeviceToken(userId: string, token: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { deviceToken: token },
  })
}

export async function getNotifications(userId: string, page: number) {
  const skip = (page - 1) * PAGE_SIZE

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  return { notifications, total, unreadCount, page, limit: PAGE_SIZE }
}

export async function markOneRead(userId: string, id: string) {
  const n = await prisma.notification.findUnique({ where: { id } })
  if (!n) throw new NotFoundError('Notification not found')
  if (n.userId !== userId) throw new ForbiddenError('Not your notification')
  return prisma.notification.update({ where: { id }, data: { isRead: true } })
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true },
  })
}
