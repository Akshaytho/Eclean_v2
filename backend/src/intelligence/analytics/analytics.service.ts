// eClean — Analytics service
//
// SEPARATION RULE: This service NEVER imports from core modules.
// It reads from analytics_* tables (pre-computed by aggregation job)
// and occasionally from core tables via its own Prisma queries.
// When admin splits to a separate repo, this file moves cleanly.

import { prisma } from '../../lib/prisma'
import type {
  DateRangeQuery,
  LeaderboardQuery,
  CityQuery,
} from './analytics.schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function periodStart(period: 'day' | 'week' | 'month'): Date {
  if (period === 'day') return daysAgo(1)
  if (period === 'week') return daysAgo(7)
  return daysAgo(30)
}

// ─── Zone trend ───────────────────────────────────────────────────────────────
// GET /api/v1/analytics/zones/:id/trend?days=30
// Returns array of daily dirty scores + key metrics for charting.

export async function getZoneTrend(zoneId: string, query: DateRangeQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  const snapshots = await prisma.analyticsZoneSnapshot.findMany({
    where: {
      zoneId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: 'asc' },
    select: {
      date:                  true,
      dirtyScore:            true,
      tasksCreated:          true,
      tasksCompleted:        true,
      avgAiScore:            true,
      aiRejectionRate:       true,
      citizenReportCount:    true,
      avgCompletionTimeSecs: true,
      activeWorkerCount:     true,
      openTaskCountSnapshot: true,
    },
  })

  // Compute trend direction
  const scores = snapshots.map(s => s.dirtyScore)
  let trend: 'improving' | 'stable' | 'degrading' = 'stable'
  if (scores.length >= 7) {
    const firstWeek = scores.slice(0, 7).reduce((a, b) => a + b, 0) / 7
    const lastWeek  = scores.slice(-7).reduce((a, b) => a + b, 0) / 7
    const diff = lastWeek - firstWeek
    if (diff > 5) trend = 'degrading'
    else if (diff < -5) trend = 'improving'
  }

  return {
    zoneId,
    from: from.toISOString(),
    to: to.toISOString(),
    dataPoints: snapshots.length,
    trend,
    currentScore: scores.length > 0 ? scores[scores.length - 1] : null,
    snapshots,
  }
}

// ─── Zone heatmap ─────────────────────────────────────────────────────────────
// GET /api/v1/analytics/zones/heatmap?city=Hyderabad&from=&to=
// Returns GeoJSON-compatible data for map overlays.

export async function getZoneHeatmap(query: CityQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(30)
  const to   = query.to   ? new Date(query.to)   : new Date()

  // Get latest snapshot per zone
  const zones = await prisma.zone.findMany({
    where: query.city
      ? { city: { contains: query.city, mode: 'insensitive' } }
      : {},
    select: {
      id: true, name: true, city: true,
      lat: true, lng: true, radiusMeters: true,
      dirtyLevel: true,
    },
  })

  const zoneIds = zones.map(z => z.id)

  // Get average dirty scores over the period
  const snapshots = await prisma.analyticsZoneSnapshot.groupBy({
    by: ['zoneId'],
    where: {
      zoneId: { in: zoneIds },
      date: { gte: from, lte: to },
    },
    _avg: {
      dirtyScore: true,
      citizenReportCount: true,
    },
    _sum: {
      tasksCompleted: true,
      citizenReportCount: true,
    },
    _count: { id: true },
  })

  const scoreMap = new Map(snapshots.map(s => [s.zoneId, s]))

  const features = zones
    .filter(z => z.lat !== null && z.lng !== null)
    .map(z => {
      const stats = scoreMap.get(z.id)
      return {
        type: 'Feature' as const,
        properties: {
          zoneId: z.id,
          name: z.name,
          city: z.city,
          dirtyLevel: z.dirtyLevel,
          avgDirtyScore: Math.round(stats?._avg?.dirtyScore ?? 0),
          totalReports: stats?._sum?.citizenReportCount ?? 0,
          totalCompleted: stats?._sum?.tasksCompleted ?? 0,
          dataPoints: stats?._count?.id ?? 0,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [z.lng!, z.lat!],
        },
      }
    })

  return {
    type: 'FeatureCollection' as const,
    features,
    meta: {
      from: from.toISOString(),
      to: to.toISOString(),
      zoneCount: features.length,
    },
  }
}

// ─── Platform metrics ─────────────────────────────────────────────────────────
// GET /api/v1/analytics/platform?from=&to=
// Returns daily metrics for admin dashboard charts.

export async function getPlatformMetrics(query: DateRangeQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  const metrics = await prisma.analyticsPlatformMetrics.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  })

  // Compute summary totals
  const summary = {
    tasksCreated:   metrics.reduce((s, m) => s + m.tasksCreated, 0),
    tasksCompleted: metrics.reduce((s, m) => s + m.tasksCompleted, 0),
    tasksCancelled: metrics.reduce((s, m) => s + m.tasksCancelled, 0),
    tasksDisputed:  metrics.reduce((s, m) => s + m.tasksDisputed, 0),
    totalRevenueCents:   metrics.reduce((s, m) => s + m.totalRevenueCents, 0),
    platformFeeCents:    metrics.reduce((s, m) => s + m.platformFeeCents, 0),
    totalPayoutCents:    metrics.reduce((s, m) => s + m.totalPayoutCents, 0),
    totalNewSignups:     metrics.reduce((s, m) => s + m.newSignups, 0),
    citizenReportsTotal: metrics.reduce((s, m) => s + m.citizenReportsTotal, 0),
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    dataPoints: metrics.length,
    summary,
    daily: metrics,
  }
}

// ─── Worker leaderboard ───────────────────────────────────────────────────────
// GET /api/v1/analytics/workers/leaderboard?period=week&limit=10

export async function getWorkerLeaderboard(query: LeaderboardQuery) {
  const since = periodStart(query.period)

  const workers = await prisma.analyticsWorkerDaily.groupBy({
    by: ['workerId', 'workerName'],
    where: { date: { gte: since } },
    _sum: {
      tasksCompleted: true,
      earningsCents: true,
    },
    _avg: {
      avgAiScore: true,
      avgTimeSecs: true,
    },
    _count: { id: true },
    orderBy: { _sum: { tasksCompleted: 'desc' } },
    take: query.limit,
  })

  return {
    period: query.period,
    since: since.toISOString(),
    leaderboard: workers.map((w, i) => ({
      rank: i + 1,
      workerId: w.workerId,
      workerName: w.workerName,
      tasksCompleted: w._sum.tasksCompleted ?? 0,
      earningsCents: w._sum.earningsCents ?? 0,
      avgAiScore: w._avg.avgAiScore ? Math.round(w._avg.avgAiScore * 100) / 100 : null,
      avgTimeSecs: w._avg.avgTimeSecs ? Math.round(w._avg.avgTimeSecs) : null,
      daysActive: w._count.id,
    })),
  }
}

// ─── Worker individual trend ──────────────────────────────────────────────────
// GET /api/v1/analytics/workers/:id/trend?days=30

export async function getWorkerTrend(workerId: string, query: DateRangeQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  const daily = await prisma.analyticsWorkerDaily.findMany({
    where: {
      workerId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: 'asc' },
  })

  const summary = {
    totalTasksCompleted: daily.reduce((s, d) => s + d.tasksCompleted, 0),
    totalEarningsCents:  daily.reduce((s, d) => s + d.earningsCents, 0),
    avgAiScore: daily.filter(d => d.avgAiScore !== null).length > 0
      ? Math.round(daily.reduce((s, d) => s + (d.avgAiScore ?? 0), 0) / daily.filter(d => d.avgAiScore !== null).length * 100) / 100
      : null,
    daysActive: daily.length,
  }

  return {
    workerId,
    from: from.toISOString(),
    to: to.toISOString(),
    summary,
    daily,
  }
}

// ─── Photo fraud detection ────────────────────────────────────────────────────
// GET /api/v1/analytics/photo-fraud?from=&to=

export async function getPhotoFraudFlags(query: DateRangeQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  const flagged = await prisma.analyticsPhotoMeta.findMany({
    where: {
      isFlagged: true,
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const totalFlagged = await prisma.analyticsPhotoMeta.count({
    where: {
      isFlagged: true,
      createdAt: { gte: from, lte: to },
    },
  })

  const totalPhotos = await prisma.analyticsPhotoMeta.count({
    where: { createdAt: { gte: from, lte: to } },
  })

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalPhotos,
    totalFlagged,
    flagRate: totalPhotos > 0 ? Math.round(totalFlagged / totalPhotos * 10000) / 100 : 0,
    flagged,
  }
}

// ─── Supply-demand analysis ───────────────────────────────────────────────────
// GET /api/v1/analytics/supply-demand?city=

export async function getSupplyDemand(city?: string) {
  // Get zones with counts
  const zones = await prisma.zone.findMany({
    where: city ? { city: { contains: city, mode: 'insensitive' } } : {},
    select: {
      id: true, name: true, city: true,
      lat: true, lng: true,
      _count: {
        select: {
          tasks: { where: { status: 'OPEN' } },
        },
      },
    },
  })

  // Get active workers per zone (workers who completed tasks in last 7 days)
  const recentWorkers = await prisma.analyticsWorkerDaily.findMany({
    where: { date: { gte: daysAgo(7) } },
    select: { workerId: true, zonesWorked: true },
    distinct: ['workerId'],
  })

  // Count workers per zone
  const workersByZone = new Map<string, number>()
  for (const w of recentWorkers) {
    for (const zoneId of w.zonesWorked) {
      workersByZone.set(zoneId, (workersByZone.get(zoneId) ?? 0) + 1)
    }
  }

  const analysis = zones.map(z => ({
    zoneId: z.id,
    zoneName: z.name,
    city: z.city,
    lat: z.lat,
    lng: z.lng,
    openTasks: z._count.tasks,
    activeWorkers: workersByZone.get(z.id) ?? 0,
    ratio: (workersByZone.get(z.id) ?? 0) > 0
      ? Math.round(z._count.tasks / (workersByZone.get(z.id) ?? 1) * 100) / 100
      : z._count.tasks > 0 ? Infinity : 0,
    status: (workersByZone.get(z.id) ?? 0) === 0 && z._count.tasks > 0
      ? 'NO_SUPPLY'
      : z._count.tasks > (workersByZone.get(z.id) ?? 0) * 2
        ? 'UNDER_SUPPLIED'
        : z._count.tasks === 0
          ? 'IDLE'
          : 'BALANCED',
  }))

  return {
    city: city ?? 'all',
    zones: analysis.sort((a, b) => b.openTasks - a.openTasks),
    summary: {
      totalOpenTasks: analysis.reduce((s, z) => s + z.openTasks, 0),
      totalActiveWorkers: new Set(recentWorkers.map(w => w.workerId)).size,
      underSuppliedZones: analysis.filter(z => z.status === 'UNDER_SUPPLIED' || z.status === 'NO_SUPPLY').length,
    },
  }
}
