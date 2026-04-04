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
import { notifyUser } from '../lib/notify'

export const TASK_EXPIRY_QUEUE = 'task-expiry'

export const taskExpiryQueue = new Queue(TASK_EXPIRY_QUEUE, { connection })

const ACCEPTED_TIMEOUT_HOURS = 2  // release after 2 hours in ACCEPTED
const IN_PROGRESS_TIMEOUT_HOURS = 4  // release after 4 hours with no activity

export function createTaskExpiryWorker(): Worker {
  const worker = new Worker(
    TASK_EXPIRY_QUEUE,
    async () => {
      logger.info('Task expiry check running')

      // PERF: only select fields needed for expiry — skip large text fields (aiReasoning, etc.)
      const expirySelect = {
        id: true, title: true, status: true, workerId: true, buyerId: true,
      } as const

      // 1. Find tasks stuck in ACCEPTED for too long
      const stuckAccepted = await prisma.task.findMany({
        where: {
          status: 'ACCEPTED',
          updatedAt: { lt: new Date(Date.now() - ACCEPTED_TIMEOUT_HOURS * 60 * 60 * 1000) },
        },
        select: expirySelect,
      })

      // 2. Find tasks stuck in IN_PROGRESS with no recent activity
      const stuckInProgress = await prisma.task.findMany({
        where: {
          status: 'IN_PROGRESS',
          updatedAt: { lt: new Date(Date.now() - IN_PROGRESS_TIMEOUT_HOURS * 60 * 60 * 1000) },
        },
        select: expirySelect,
      })

      const allStuck = [...stuckAccepted, ...stuckInProgress]

      for (const task of allStuck) {
        try {
          // Release task + cleanup in a single transaction to prevent race conditions
          // Without this, a crash between status update and cleanup leaves stale worker photos
          await prisma.$transaction(async (tx) => {
            await tx.task.update({
              where: { id: task.id },
              data: { status: 'OPEN', workerId: null, startedAt: null, submittedAt: null },
            })

            // SECURITY: clean up worker's media/submissions to prevent piggyback attacks
            await tx.taskMedia.deleteMany({
              where: { taskId: task.id, type: { in: ['BEFORE', 'AFTER', 'PROOF'] } },
            })
            if (task.workerId) {
              await tx.workerPointSubmission.deleteMany({
                where: { taskId: task.id, workerId: task.workerId },
              })
              await tx.taskLocationLog.deleteMany({
                where: { taskId: task.id, workerId: task.workerId },
              })
            }
          })

          // Free the worker
          if (task.workerId) {
            await prisma.workerProfile.update({
              where: { userId: task.workerId },
              data: { activeTaskId: null },
            }).catch((err) => { logger.warn({ err }, 'Task expiry cleanup failed') })

            // Notify worker (DB + push + socket)
            await notifyUser({
              userId: task.workerId,
              type: 'TASK_REJECTED',
              title: 'Task Released',
              body: `Task "${task.title}" was released because it wasn't started in time. It's now available for other workers.`,
              data: { taskId: task.id },
            })

            // Decrement worker trust score slightly
            await prisma.workerProfile.update({
              where: { userId: task.workerId },
              data: { trustScore: { decrement: 2 } },
            }).catch((err) => { logger.warn({ err }, 'Task expiry cleanup failed') })
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
  }).catch((err) => { logger.warn({ err }, 'Task expiry cleanup failed') })

  return worker
}
