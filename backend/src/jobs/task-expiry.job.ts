/**
 * Task Expiry Job — auto-release stuck tasks
 *
 * Runs every 30 minutes via BullMQ repeatable job.
 * Releases tasks that have been ACCEPTED but not started for 2+ hours.
 * Also releases IN_PROGRESS tasks with no activity for 4+ hours.
 *
 * Prevents: worker accepts and ghosts → task locked forever
 */

import { Queue, Worker } from 'bullmq'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { bullmqConnection as connection } from '../lib/bullmq'
import { emitTaskUpdated } from '../realtime/socket'

export const TASK_EXPIRY_QUEUE = 'task-expiry'

export const taskExpiryQueue = new Queue(TASK_EXPIRY_QUEUE, { connection })

const ACCEPTED_TIMEOUT_HOURS = 2  // release after 2 hours in ACCEPTED
const IN_PROGRESS_TIMEOUT_HOURS = 4  // release after 4 hours with no activity

export function createTaskExpiryWorker(): Worker {
  const worker = new Worker(
    TASK_EXPIRY_QUEUE,
    async () => {
      logger.info('Task expiry check running')

      // 1. Find tasks stuck in ACCEPTED for too long
      const stuckAccepted = await prisma.task.findMany({
        where: {
          status: 'ACCEPTED',
          updatedAt: { lt: new Date(Date.now() - ACCEPTED_TIMEOUT_HOURS * 60 * 60 * 1000) },
        },
      })

      // 2. Find tasks stuck in IN_PROGRESS with no recent activity
      const stuckInProgress = await prisma.task.findMany({
        where: {
          status: 'IN_PROGRESS',
          updatedAt: { lt: new Date(Date.now() - IN_PROGRESS_TIMEOUT_HOURS * 60 * 60 * 1000) },
        },
      })

      const allStuck = [...stuckAccepted, ...stuckInProgress]

      for (const task of allStuck) {
        try {
          // Release task back to OPEN
          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'OPEN', workerId: null },
          })

          // Free the worker
          if (task.workerId) {
            await prisma.workerProfile.update({
              where: { userId: task.workerId },
              data: { activeTaskId: null },
            }).catch(() => {})

            // Notify worker
            await prisma.notification.create({
              data: {
                userId: task.workerId,
                type: 'TASK_REJECTED',
                title: 'Task Released',
                body: `Task "${task.title}" was released because it wasn't started in time. It's now available for other workers.`,
                data: { taskId: task.id },
              },
            }).catch(() => {})

            // Decrement worker trust score slightly
            await prisma.workerProfile.update({
              where: { userId: task.workerId },
              data: { trustScore: { decrement: 2 } },
            }).catch(() => {})
          }

          emitTaskUpdated(task.id, 'OPEN')
          logger.info({ taskId: task.id, prevStatus: task.status, workerId: task.workerId }, 'Task expired and released back to OPEN')
        } catch (err) {
          logger.error({ taskId: task.id, err }, 'Failed to expire task')
        }
      }

      logger.info({ expiredCount: allStuck.length }, 'Task expiry check complete')
    },
    { connection },
  )

  // Schedule repeatable job every 30 minutes
  taskExpiryQueue.add('check-expiry', {}, {
    repeat: { every: 30 * 60 * 1000 }, // 30 minutes
    jobId: 'task-expiry-repeatable',
  }).catch(() => {})

  return worker
}
