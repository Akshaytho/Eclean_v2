// eClean — Analytics Aggregation Job
//
// BullMQ worker that runs daily at 2:00 AM IST (20:30 UTC).
// Reads yesterday's raw data from core tables, computes aggregations,
// and writes to analytics_* tables.
//
// IDEMPOTENT: Uses upsert with (date + entityId) as unique key.
// Safe to re-run, backfill, or execute in parallel.
//
// SEPARATION RULE: Reads from core tables (Task, User, Zone, etc.)
// but ONLY WRITES to analytics_* tables. Never mutates core data.

import { Queue, Worker } from 'bullmq'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { bullmqConnection as connection } from '../lib/bullmq'

// ─── Queue ────────────────────────────────────────────────────────────────────

export const ANALYTICS_QUEUE = 'analytics-aggregation'

export const analyticsQueue = new Queue(ANALYTICS_QUEUE, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 30 },
    removeOnFail:     { count: 10 },
  },
})

// ─── Schedule ─────────────────────────────────────────────────────────────────

export async function scheduleAnalyticsJobs(): Promise<void> {
  // Run daily at 02:00 IST = 20:30 UTC (previous day)
  await analyticsQueue.add(
    'daily-aggregate',
    {},
    {
      jobId:  'daily-aggregate',
      repeat: { pattern: '30 20 * * *' }, // 20:30 UTC = 02:00 IST
    },
  )
  logger.info('Analytics aggregation jobs scheduled (daily 02:00 IST)')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function yesterday(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// ─── Step 1: Zone Snapshots ───────────────────────────────────────────────────

async function aggregateZoneSnapshots(dayStart: Date, dayEnd: Date): Promise<number> {
  const zones = await prisma.zone.findMany({
    select: { id: true, name: true, city: true, lastInspectedAt: true },
  })

  let count = 0

  for (const zone of zones) {
    // Tasks in this zone on this day
    const tasks = await prisma.task.findMany({
      where: {
        zoneId: zone.id,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { status: true, aiScore: true, timeSpentSecs: true, workerId: true },
    })

    const created   = tasks.length
    const completed = tasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED').length
    const cancelled = tasks.filter(t => t.status === 'CANCELLED').length
    const aiScores  = tasks.filter(t => t.aiScore !== null).map(t => t.aiScore!)
    const avgAi     = aiScores.length > 0 ? aiScores.reduce((a, b) => a + b, 0) / aiScores.length : null
    const rejected  = aiScores.filter(s => s < 0.5).length
    const rejRate   = aiScores.length > 0 ? rejected / aiScores.length : null
    const completionTimes = tasks.filter(t => t.timeSpentSecs !== null).map(t => t.timeSpentSecs!)
    const avgTime   = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
      : null
    const activeWorkers = new Set(tasks.filter(t => t.workerId).map(t => t.workerId!)).size

    // Citizen reports in this zone on this day
    const reportCount = await prisma.citizenReport.count({
      where: {
        zoneId: zone.id,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    })

    // Open tasks at end of day
    const openTasks = await prisma.task.count({
      where: { zoneId: zone.id, status: 'OPEN', createdAt: { lte: dayEnd } },
    })

    // ── Dirty score formula ──────────────────────────────────────────────
    // (citizenReports_7d × 3) + (openTasks × 2) + (rejRate × 20) + (daysSinceInspect × 1.5) - (completionRatio × 10)
    const sevenDaysAgo = new Date(dayStart)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const reports7d = await prisma.citizenReport.count({
      where: { zoneId: zone.id, createdAt: { gte: sevenDaysAgo, lte: dayEnd } },
    })

    const daysSinceInspect = zone.lastInspectedAt
      ? Math.floor((dayEnd.getTime() - zone.lastInspectedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 30 // assume 30 days if never inspected

    const completionRatio = created > 0 ? completed / created : 0

    const rawScore = (reports7d * 3) + (openTasks * 2)
      + ((rejRate ?? 0) * 20) + (daysSinceInspect * 1.5)
      - (completionRatio * 10)

    const dirtyScore = Math.max(0, Math.min(100, Math.round(rawScore)))

    // Upsert — idempotent
    await prisma.analyticsZoneSnapshot.upsert({
      where: { zoneId_date: { zoneId: zone.id, date: dayStart } },
      create: {
        zoneId: zone.id,
        zoneName: zone.name,
        city: zone.city,
        date: dayStart,
        dirtyScore,
        tasksCreated: created,
        tasksCompleted: completed,
        tasksCancelled: cancelled,
        avgAiScore: avgAi,
        aiRejectionRate: rejRate,
        citizenReportCount: reportCount,
        avgCompletionTimeSecs: avgTime,
        activeWorkerCount: activeWorkers,
        openTaskCountSnapshot: openTasks,
      },
      update: {
        zoneName: zone.name,
        city: zone.city,
        dirtyScore,
        tasksCreated: created,
        tasksCompleted: completed,
        tasksCancelled: cancelled,
        avgAiScore: avgAi,
        aiRejectionRate: rejRate,
        citizenReportCount: reportCount,
        avgCompletionTimeSecs: avgTime,
        activeWorkerCount: activeWorkers,
        openTaskCountSnapshot: openTasks,
      },
    })
    count++
  }

  return count
}

// ─── Step 2: Platform Metrics ─────────────────────────────────────────────────

async function aggregatePlatformMetrics(dayStart: Date, dayEnd: Date): Promise<void> {
  const [created, completed, cancelled, disputed] = await Promise.all([
    prisma.task.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.task.count({ where: { completedAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.task.count({ where: { cancelledAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.task.count({ where: { status: 'DISPUTED', updatedAt: { gte: dayStart, lte: dayEnd } } }),
  ])

  // Revenue from completed tasks
  const revenue = await prisma.task.aggregate({
    where: { completedAt: { gte: dayStart, lte: dayEnd } },
    _sum: { rateCents: true },
  })

  // Payouts
  const payouts = await prisma.payout.aggregate({
    where: { createdAt: { gte: dayStart, lte: dayEnd }, status: { in: ['COMPLETED', 'PROCESSING'] } },
    _sum: { workerAmountCents: true, platformFeeCents: true },
  })

  // Active users
  const activeWorkers = await prisma.task.findMany({
    where: { workerId: { not: null }, updatedAt: { gte: dayStart, lte: dayEnd } },
    select: { workerId: true },
    distinct: ['workerId'],
  })
  const activeBuyers = await prisma.task.findMany({
    where: { updatedAt: { gte: dayStart, lte: dayEnd } },
    select: { buyerId: true },
    distinct: ['buyerId'],
  })

  // New signups
  const signups = await prisma.user.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
    select: { role: true },
  })
  const signupsByRole: Record<string, number> = {}
  for (const s of signups) {
    signupsByRole[s.role] = (signupsByRole[s.role] ?? 0) + 1
  }

  // AI scores
  const aiTasks = await prisma.task.findMany({
    where: { submittedAt: { gte: dayStart, lte: dayEnd }, aiScore: { not: null } },
    select: { aiScore: true },
  })
  const avgAi = aiTasks.length > 0
    ? aiTasks.reduce((s, t) => s + t.aiScore!, 0) / aiTasks.length
    : null

  // Avg completion time
  const completedTasks = await prisma.task.findMany({
    where: { completedAt: { gte: dayStart, lte: dayEnd }, timeSpentSecs: { not: null } },
    select: { timeSpentSecs: true },
  })
  const avgTime = completedTasks.length > 0
    ? Math.round(completedTasks.reduce((s, t) => s + t.timeSpentSecs!, 0) / completedTasks.length)
    : null

  const citizenReports = await prisma.citizenReport.count({
    where: { createdAt: { gte: dayStart, lte: dayEnd } },
  })

  await prisma.analyticsPlatformMetrics.upsert({
    where: { date: dayStart },
    create: {
      date: dayStart,
      tasksCreated: created,
      tasksCompleted: completed,
      tasksCancelled: cancelled,
      tasksDisputed: disputed,
      totalRevenueCents: revenue._sum.rateCents ?? 0,
      platformFeeCents: payouts._sum.platformFeeCents ?? 0,
      totalPayoutCents: payouts._sum.workerAmountCents ?? 0,
      activeWorkers: activeWorkers.length,
      activeBuyers: activeBuyers.length,
      newSignups: signups.length,
      newSignupsByRole: signupsByRole,
      avgTaskCompletionSecs: avgTime,
      avgAiScore: avgAi,
      citizenReportsTotal: citizenReports,
    },
    update: {
      tasksCreated: created,
      tasksCompleted: completed,
      tasksCancelled: cancelled,
      tasksDisputed: disputed,
      totalRevenueCents: revenue._sum.rateCents ?? 0,
      platformFeeCents: payouts._sum.platformFeeCents ?? 0,
      totalPayoutCents: payouts._sum.workerAmountCents ?? 0,
      activeWorkers: activeWorkers.length,
      activeBuyers: activeBuyers.length,
      newSignups: signups.length,
      newSignupsByRole: signupsByRole,
      avgTaskCompletionSecs: avgTime,
      avgAiScore: avgAi,
      citizenReportsTotal: citizenReports,
    },
  })
}

// ─── Step 3: Waste Patterns ───────────────────────────────────────────────────

async function aggregateWastePatterns(dayStart: Date, dayEnd: Date): Promise<number> {
  const dayOfWeek = dayStart.getDay() // 0=Sun

  // Get all tasks and reports created on this day with timestamps
  const tasks = await prisma.task.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd }, zoneId: { not: null } },
    select: { zoneId: true, createdAt: true },
  })

  const reports = await prisma.citizenReport.findMany({
    where: { createdAt: { gte: dayStart, lte: dayEnd }, zoneId: { not: null } },
    select: { zoneId: true, createdAt: true },
  })

  // Group by zone + hour
  const buckets = new Map<string, { taskCount: number; reportCount: number }>()

  for (const t of tasks) {
    const hour = t.createdAt.getHours()
    const key = `${t.zoneId}:${hour}`
    const b = buckets.get(key) ?? { taskCount: 0, reportCount: 0 }
    b.taskCount++
    buckets.set(key, b)
  }

  for (const r of reports) {
    const hour = r.createdAt.getHours()
    const key = `${r.zoneId}:${hour}`
    const b = buckets.get(key) ?? { taskCount: 0, reportCount: 0 }
    b.reportCount++
    buckets.set(key, b)
  }

  let count = 0
  for (const [key, data] of buckets) {
    const [zoneId, hourStr] = key.split(':')
    const hourOfDay = parseInt(hourStr, 10)

    await prisma.analyticsWastePattern.upsert({
      where: { zoneId_date_hourOfDay: { zoneId, date: dayStart, hourOfDay } },
      create: {
        zoneId,
        date: dayStart,
        hourOfDay,
        dayOfWeek,
        reportCount: data.reportCount,
        taskCount: data.taskCount,
      },
      update: {
        dayOfWeek,
        reportCount: data.reportCount,
        taskCount: data.taskCount,
      },
    })
    count++
  }

  return count
}

// ─── Step 4: Worker Daily ─────────────────────────────────────────────────────

async function aggregateWorkerDaily(dayStart: Date, dayEnd: Date): Promise<number> {
  // Get all workers who had task activity that day
  const taskActivity = await prisma.task.findMany({
    where: {
      workerId: { not: null },
      updatedAt: { gte: dayStart, lte: dayEnd },
    },
    select: {
      workerId: true, status: true, zoneId: true, category: true,
      timeSpentSecs: true, aiScore: true,
    },
  })

  // Group by worker
  const workerMap = new Map<string, typeof taskActivity>()
  for (const t of taskActivity) {
    const list = workerMap.get(t.workerId!) ?? []
    list.push(t)
    workerMap.set(t.workerId!, list)
  }

  let count = 0
  for (const [workerId, tasks] of workerMap) {
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: { name: true },
    })

    const accepted  = tasks.filter(t => t.status === 'ACCEPTED').length
    const completed = tasks.filter(t => t.status === 'APPROVED' || t.status === 'COMPLETED').length
    const cancelled = tasks.filter(t => t.status === 'CANCELLED').length
    const aiScores  = tasks.filter(t => t.aiScore !== null).map(t => t.aiScore!)
    const avgAi     = aiScores.length > 0 ? aiScores.reduce((a, b) => a + b, 0) / aiScores.length : null
    const times     = tasks.filter(t => t.timeSpentSecs !== null).map(t => t.timeSpentSecs!)
    const avgTime   = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null
    const zones     = [...new Set(tasks.filter(t => t.zoneId).map(t => t.zoneId!))]
    const categories = [...new Set(tasks.map(t => t.category))]

    // GPS distance
    const gpsLogs = await prisma.taskLocationLog.findMany({
      where: { workerId, createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: 'asc' },
      select: { lat: true, lng: true },
    })
    let totalDistance = 0
    for (let i = 1; i < gpsLogs.length; i++) {
      totalDistance += haversineMeters(
        gpsLogs[i-1].lat, gpsLogs[i-1].lng,
        gpsLogs[i].lat, gpsLogs[i].lng,
      )
    }

    // Earnings
    const earnings = await prisma.payout.aggregate({
      where: {
        workerId,
        status: 'COMPLETED',
        paidAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { workerAmountCents: true },
    })

    await prisma.analyticsWorkerDaily.upsert({
      where: { workerId_date: { workerId, date: dayStart } },
      create: {
        workerId,
        workerName: worker?.name ?? 'Unknown',
        date: dayStart,
        tasksAccepted: accepted,
        tasksCompleted: completed,
        tasksCancelled: cancelled,
        avgTimeSecs: avgTime,
        avgAiScore: avgAi,
        totalDistanceMeters: totalDistance > 0 ? Math.round(totalDistance) : null,
        earningsCents: earnings._sum.workerAmountCents ?? 0,
        zonesWorked: zones,
        categoriesWorked: categories,
      },
      update: {
        workerName: worker?.name ?? 'Unknown',
        tasksAccepted: accepted,
        tasksCompleted: completed,
        tasksCancelled: cancelled,
        avgTimeSecs: avgTime,
        avgAiScore: avgAi,
        totalDistanceMeters: totalDistance > 0 ? Math.round(totalDistance) : null,
        earningsCents: earnings._sum.workerAmountCents ?? 0,
        zonesWorked: zones,
        categoriesWorked: categories,
      },
    })
    count++
  }

  return count
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createAnalyticsWorker(): Worker {
  const worker = new Worker(
    ANALYTICS_QUEUE,
    async (job) => {
      if (job.name !== 'daily-aggregate') return

      logger.info({ jobId: job.id }, 'Analytics daily aggregation started')
      const startTime = Date.now()

      const { start, end } = yesterday()
      logger.info({ date: start.toISOString().slice(0, 10) }, 'Aggregating data for date')

      try {
        // Step 1: Zone snapshots
        const zoneCount = await aggregateZoneSnapshots(start, end)
        logger.info({ zoneCount }, 'Step 1/4: Zone snapshots complete')

        // Step 2: Platform metrics
        await aggregatePlatformMetrics(start, end)
        logger.info('Step 2/4: Platform metrics complete')

        // Step 3: Waste patterns
        const patternCount = await aggregateWastePatterns(start, end)
        logger.info({ patternCount }, 'Step 3/4: Waste patterns complete')

        // Step 4: Worker daily
        const workerCount = await aggregateWorkerDaily(start, end)
        logger.info({ workerCount }, 'Step 4/4: Worker daily complete')

        const elapsed = Math.round((Date.now() - startTime) / 1000)
        logger.info(
          { elapsed, zoneCount, patternCount, workerCount },
          `Analytics aggregation complete in ${elapsed}s`,
        )
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Analytics aggregation failed')
        throw err // let BullMQ retry
      }
    },
    {
      connection,
      concurrency: 1, // never run two aggregations in parallel
    },
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Analytics aggregation job permanently failed')
  })

  return worker
}
