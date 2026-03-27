// eClean — BullMQ cleanup jobs
// Runs on a repeating schedule to keep the DB lean.
//
// Job 1: TaskLocationLog retention
//   Schedule: daily at 03:00 UTC
//   Action:   delete TaskLocationLog rows older than 90 days
//   Reason:   at 1,000 concurrent workers sending GPS every 30s → 2.88M rows/day
//             90 days of history has no operational value, GPS is only needed while task is active

import { Queue, Worker } from 'bullmq'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { bullmqConnection as connection } from '../lib/bullmq'

export const CLEANUP_QUEUE = 'cleanup'

export const cleanupQueue = new Queue(CLEANUP_QUEUE, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 10 },
  },
})

// ─── Schedule repeating jobs ──────────────────────────────────────────────────

export async function scheduleCleanupJobs(): Promise<void> {
  // Delete TaskLocationLogs older than 90 days — runs daily at 03:00 UTC
  await cleanupQueue.add(
    'location-log-retention',
    {},
    {
      jobId:  'location-log-retention',
      repeat: { pattern: '0 3 * * *' }, // cron: 03:00 UTC daily
    },
  )
  logger.info('Cleanup jobs scheduled')
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createCleanupWorker(): Worker {
  const worker = new Worker(
    CLEANUP_QUEUE,
    async (job) => {
      if (job.name === 'location-log-retention') {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 90)

        const result = await prisma.taskLocationLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        })

        logger.info({ deleted: result.count, cutoff }, 'TaskLocationLog retention: rows deleted')
      }
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Cleanup job failed')
  })

  return worker
}
