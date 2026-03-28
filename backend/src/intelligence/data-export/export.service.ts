// eClean — Data Export service
//
// ALL data returned by these functions is ANONYMIZED.
// No worker names, buyer names, emails, phone numbers, or any PII.
// Only zone-level aggregates, scores, and patterns.
//
// SEPARATION RULE: Reads from analytics_* tables only.
// When admin splits, this module moves cleanly.

import { prisma } from '../../lib/prisma'
import type {
  ZonesExportQuery,
  WastePatternsQuery,
  CleanlinessIndexQuery,
  DrainRiskQuery,
} from './export.schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

// ─── Zones export ─────────────────────────────────────────────────────────────
// GET /api/v1/data/zones?city=&from=&to=&format=geojson
// Anonymized zone data: scores, task density, report frequency.

export async function exportZones(query: ZonesExportQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  const zones = await prisma.zone.findMany({
    where: query.city
      ? { city: { contains: query.city, mode: 'insensitive' } }
      : {},
    select: { id: true, name: true, city: true, lat: true, lng: true, radiusMeters: true },
  })

  const zoneIds = zones.map(z => z.id)

  const snapshots = await prisma.analyticsZoneSnapshot.groupBy({
    by: ['zoneId'],
    where: {
      zoneId: { in: zoneIds },
      date: { gte: from, lte: to },
    },
    _avg: { dirtyScore: true, avgAiScore: true, aiRejectionRate: true },
    _sum: { tasksCreated: true, tasksCompleted: true, citizenReportCount: true },
    _count: { id: true },
  })

  const scoreMap = new Map(snapshots.map(s => [s.zoneId, s]))

  const data = zones.filter(z => z.lat && z.lng).map(z => {
    const stats = scoreMap.get(z.id)
    return {
      zoneId: z.id,
      name: z.name,
      city: z.city,
      lat: z.lat,
      lng: z.lng,
      radiusMeters: z.radiusMeters,
      avgDirtyScore: Math.round(stats?._avg?.dirtyScore ?? 0),
      avgAiVerificationScore: stats?._avg?.avgAiScore ? Math.round(stats._avg.avgAiScore * 100) / 100 : null,
      aiRejectionRate: stats?._avg?.aiRejectionRate ? Math.round(stats._avg.aiRejectionRate * 100) / 100 : null,
      totalTasks: stats?._sum?.tasksCreated ?? 0,
      completedTasks: stats?._sum?.tasksCompleted ?? 0,
      citizenReports: stats?._sum?.citizenReportCount ?? 0,
      dataPoints: stats?._count?.id ?? 0,
    }
  })

  if (query.format === 'geojson') {
    return {
      type: 'FeatureCollection' as const,
      features: data.map(d => ({
        type: 'Feature' as const,
        properties: { ...d, lat: undefined, lng: undefined },
        geometry: { type: 'Point' as const, coordinates: [d.lng!, d.lat!] },
      })),
      meta: { from: from.toISOString(), to: to.toISOString(), count: data.length },
    }
  }

  return { zones: data, from: from.toISOString(), to: to.toISOString(), count: data.length }
}

// ─── Waste patterns ───────────────────────────────────────────────────────────
// GET /api/v1/data/waste-patterns?city=&from=&to=
// Waste generation by zone x hour-of-day. Municipal planning data.

export async function exportWastePatterns(query: WastePatternsQuery) {
  const from = query.from ? new Date(query.from) : daysAgo(query.days)
  const to   = query.to   ? new Date(query.to)   : new Date()

  // Determine zone filter
  let zoneIds: string[] | undefined
  if (query.zoneId) {
    zoneIds = [query.zoneId]
  } else if (query.city) {
    const zones = await prisma.zone.findMany({
      where: { city: { contains: query.city, mode: 'insensitive' } },
      select: { id: true },
    })
    zoneIds = zones.map(z => z.id)
  }

  // Group by zone + hourOfDay across all dates in range
  const patterns = await prisma.analyticsWastePattern.groupBy({
    by: ['zoneId', 'hourOfDay'],
    where: {
      ...(zoneIds && { zoneId: { in: zoneIds } }),
      date: { gte: from, lte: to },
    },
    _sum: { taskCount: true, reportCount: true },
    _avg: { taskCount: true, reportCount: true },
    _count: { id: true },
    orderBy: [{ zoneId: 'asc' }, { hourOfDay: 'asc' }],
  })

  // Enrich with zone names
  const allZoneIds = [...new Set(patterns.map(p => p.zoneId))]
  const zones = await prisma.zone.findMany({
    where: { id: { in: allZoneIds } },
    select: { id: true, name: true, city: true },
  })
  const zoneMap = new Map(zones.map(z => [z.id, z]))

  const result = patterns.map(p => ({
    zoneId: p.zoneId,
    zoneName: zoneMap.get(p.zoneId)?.name ?? 'Unknown',
    city: zoneMap.get(p.zoneId)?.city ?? null,
    hourOfDay: p.hourOfDay,
    totalTasks: p._sum.taskCount ?? 0,
    totalReports: p._sum.reportCount ?? 0,
    avgDailyTasks: p._avg.taskCount ? Math.round(p._avg.taskCount * 100) / 100 : 0,
    avgDailyReports: p._avg.reportCount ? Math.round(p._avg.reportCount * 100) / 100 : 0,
    dataPoints: p._count.id,
  }))

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    patterns: result,
    count: result.length,
  }
}

// ─── Cleanliness index ────────────────────────────────────────────────────────
// GET /api/v1/data/cleanliness-index?city=&months=6
// Monthly cleanliness score per zone. Real estate valuation layer.

export async function exportCleanlinessIndex(query: CleanlinessIndexQuery) {
  const monthsAgo = new Date()
  monthsAgo.setMonth(monthsAgo.getMonth() - query.months)
  monthsAgo.setDate(1)
  monthsAgo.setHours(0, 0, 0, 0)

  let zoneFilter: { zoneId?: { in: string[] } } = {}
  if (query.zoneId) {
    zoneFilter = { zoneId: { in: [query.zoneId] } }
  } else if (query.city) {
    const zones = await prisma.zone.findMany({
      where: { city: { contains: query.city, mode: 'insensitive' } },
      select: { id: true },
    })
    zoneFilter = { zoneId: { in: zones.map(z => z.id) } }
  }

  const snapshots = await prisma.analyticsZoneSnapshot.findMany({
    where: {
      ...zoneFilter,
      date: { gte: monthsAgo },
    },
    select: {
      zoneId: true, zoneName: true, city: true, date: true, dirtyScore: true,
    },
    orderBy: [{ zoneId: 'asc' }, { date: 'asc' }],
  })

  // Group by zone → monthly averages
  type MonthBucket = { month: string; scores: number[] }
  const zoneGroups = new Map<string, { name: string; city: string | null; months: MonthBucket[] }>()

  for (const s of snapshots) {
    const monthKey = s.date.toISOString().slice(0, 7) // "2026-03"
    let group = zoneGroups.get(s.zoneId)
    if (!group) {
      group = { name: s.zoneName, city: s.city, months: [] }
      zoneGroups.set(s.zoneId, group)
    }
    let month = group.months.find(m => m.month === monthKey)
    if (!month) {
      month = { month: monthKey, scores: [] }
      group.months.push(month)
    }
    month.scores.push(s.dirtyScore)
  }

  const index = [...zoneGroups.entries()].map(([zoneId, group]) => ({
    zoneId,
    zoneName: group.name,
    city: group.city,
    // Cleanliness = 100 - dirtyScore (higher = cleaner)
    monthlyScores: group.months.map(m => ({
      month: m.month,
      cleanlinessIndex: Math.round(100 - (m.scores.reduce((a, b) => a + b, 0) / m.scores.length)),
      dataPoints: m.scores.length,
    })),
    currentCleanliness: group.months.length > 0
      ? Math.round(100 - (group.months[group.months.length - 1].scores.reduce((a, b) => a + b, 0) / group.months[group.months.length - 1].scores.length))
      : null,
  }))

  return {
    months: query.months,
    from: monthsAgo.toISOString(),
    zones: index,
    count: index.length,
  }
}

// ─── Drain risk ───────────────────────────────────────────────────────────────
// GET /api/v1/data/drain-risk?city=&season=
// Drain blockage frequency by area. Insurance risk scoring.

export async function exportDrainRisk(query: DrainRiskQuery) {
  let dateFilter: { gte?: Date; lte?: Date } = {}
  const now = new Date()
  const year = now.getFullYear()

  // Approximate Indian seasons
  if (query.season === 'monsoon') {
    dateFilter = { gte: new Date(year, 5, 1), lte: new Date(year, 8, 30) } // Jun-Sep
  } else if (query.season === 'summer') {
    dateFilter = { gte: new Date(year, 2, 1), lte: new Date(year, 4, 31) } // Mar-May
  } else if (query.season === 'winter') {
    dateFilter = { gte: new Date(year, 10, 1), lte: new Date(year + 1, 1, 28) } // Nov-Feb
  } else {
    dateFilter = { gte: daysAgo(365) }
  }

  // Get drain-related tasks and reports
  const drainTasks = await prisma.task.findMany({
    where: {
      category: 'DRAIN_CLEANING',
      createdAt: dateFilter,
      zoneId: { not: null },
      ...(query.city && {
        zone: { city: { contains: query.city, mode: 'insensitive' } },
      }),
    },
    select: { zoneId: true },
  })

  const drainReports = await prisma.citizenReport.findMany({
    where: {
      category: 'DRAIN_CLEANING',
      createdAt: dateFilter,
      zoneId: { not: null },
      ...(query.city && {
        zone: { city: { contains: query.city, mode: 'insensitive' } },
      }),
    },
    select: { zoneId: true },
  })

  // Count by zone
  const zoneCounts = new Map<string, { tasks: number; reports: number }>()
  for (const t of drainTasks) {
    const c = zoneCounts.get(t.zoneId!) ?? { tasks: 0, reports: 0 }
    c.tasks++
    zoneCounts.set(t.zoneId!, c)
  }
  for (const r of drainReports) {
    const c = zoneCounts.get(r.zoneId!) ?? { tasks: 0, reports: 0 }
    c.reports++
    zoneCounts.set(r.zoneId!, c)
  }

  // Enrich with zone info
  const zoneIds = [...zoneCounts.keys()]
  const zones = await prisma.zone.findMany({
    where: { id: { in: zoneIds } },
    select: { id: true, name: true, city: true, lat: true, lng: true },
  })
  const zoneMap = new Map(zones.map(z => [z.id, z]))

  const riskData = [...zoneCounts.entries()]
    .map(([zoneId, counts]) => {
      const zone = zoneMap.get(zoneId)
      const total = counts.tasks + counts.reports
      return {
        zoneId,
        zoneName: zone?.name ?? 'Unknown',
        city: zone?.city ?? null,
        lat: zone?.lat ?? null,
        lng: zone?.lng ?? null,
        drainTaskCount: counts.tasks,
        drainReportCount: counts.reports,
        totalIncidents: total,
        riskLevel: total >= 20 ? 'CRITICAL' : total >= 10 ? 'HIGH' : total >= 5 ? 'MEDIUM' : 'LOW',
      }
    })
    .sort((a, b) => b.totalIncidents - a.totalIncidents)

  return {
    season: query.season,
    city: query.city ?? 'all',
    zones: riskData,
    count: riskData.length,
    summary: {
      criticalZones: riskData.filter(z => z.riskLevel === 'CRITICAL').length,
      highRiskZones: riskData.filter(z => z.riskLevel === 'HIGH').length,
      totalDrainIncidents: riskData.reduce((s, z) => s + z.totalIncidents, 0),
    },
  }
}
