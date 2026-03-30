/**
 * Environmental DNA Service
 *
 * Captures and compares multi-sensor environmental fingerprints
 * to verify location without relying solely on GPS.
 *
 * Sensors: Magnetometer + Barometer + Ambient Light + Cell Info + WiFi
 * Comparison: weighted scoring 0-100
 */

import { prisma } from '../../lib/prisma'
import { NotFoundError, BadRequestError } from '../../lib/errors'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnvironmentData {
  magX?: number | null | undefined
  magY?: number | null | undefined
  magZ?: number | null | undefined
  barometer?: number | null | undefined
  ambientLight?: number | null | undefined
  cellType?: string | null | undefined
  cellCarrier?: string | null | undefined
  wifiNetworks?: string | null | undefined
  capturedAt: string
}

// ─── Save buyer fingerprint ──────────────────────────────────────────────────

export async function saveBuyerEnvironment(taskId: string, buyerId: string, data: EnvironmentData) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')
  if (task.buyerId !== buyerId) throw new BadRequestError('Not your task')

  // Upsert — one fingerprint per task
  return prisma.taskEnvironmentFingerprint.upsert({
    where: { taskId },
    update: {
      magX: data.magX ?? null,
      magY: data.magY ?? null,
      magZ: data.magZ ?? null,
      barometer: data.barometer ?? null,
      ambientLight: data.ambientLight ?? null,
      cellType: data.cellType ?? null,
      cellCarrier: data.cellCarrier ?? null,
      wifiNetworks: data.wifiNetworks ?? null,
      capturedAt: new Date(data.capturedAt),
    },
    create: {
      taskId,
      magX: data.magX ?? null,
      magY: data.magY ?? null,
      magZ: data.magZ ?? null,
      barometer: data.barometer ?? null,
      ambientLight: data.ambientLight ?? null,
      cellType: data.cellType ?? null,
      cellCarrier: data.cellCarrier ?? null,
      wifiNetworks: data.wifiNetworks ?? null,
      capturedAt: new Date(data.capturedAt),
    },
  })
}

// ─── Save worker capture + compute match score ───────────────────────────────

export async function saveWorkerEnvironment(
  taskId: string,
  workerId: string,
  captureType: 'START' | 'PHOTO' | 'SUBMIT',
  data: EnvironmentData,
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task not found')

  // Fetch buyer's fingerprint for comparison
  const buyerFp = await prisma.taskEnvironmentFingerprint.findUnique({ where: { taskId } })
  const matchScore = buyerFp ? compareEnvironmentalDNA(buyerFp, data) : null

  return prisma.workerEnvironmentCapture.create({
    data: {
      taskId,
      workerId,
      captureType,
      magX: data.magX ?? null,
      magY: data.magY ?? null,
      magZ: data.magZ ?? null,
      barometer: data.barometer ?? null,
      ambientLight: data.ambientLight ?? null,
      cellType: data.cellType ?? null,
      cellCarrier: data.cellCarrier ?? null,
      wifiNetworks: data.wifiNetworks ?? null,
      matchScore,
      capturedAt: new Date(data.capturedAt),
    },
  })
}

// ─── Get best environment match for a task ───────────────────────────────────

export async function getBestEnvironmentMatch(taskId: string): Promise<number | null> {
  const captures = await prisma.workerEnvironmentCapture.findMany({
    where: { taskId },
    orderBy: { matchScore: 'desc' },
    take: 1,
  })
  return captures[0]?.matchScore ?? null
}

// ─── Comparison Algorithm ────────────────────────────────────────────────────
// Weighted scoring: Magnetometer (30) + Cell (25) + Barometer (15) + Light (15) + WiFi (15)

function compareEnvironmentalDNA(
  buyer: { magX: number | null; magY: number | null; magZ: number | null; barometer: number | null; ambientLight: number | null; cellType: string | null; wifiNetworks: string | null },
  worker: EnvironmentData,
): number {
  let score = 0
  let maxPossible = 0

  // 1. Magnetometer proximity (30 points)
  if (buyer.magX != null && buyer.magY != null && buyer.magZ != null &&
      worker.magX != null && worker.magY != null && worker.magZ != null) {
    maxPossible += 30
    const dist = Math.sqrt(
      (buyer.magX - worker.magX) ** 2 +
      (buyer.magY - worker.magY) ** 2 +
      (buyer.magZ - worker.magZ) ** 2,
    )
    if (dist < 5) score += 30        // same spot
    else if (dist < 15) score += 20   // same building/area
    else if (dist < 30) score += 10   // same neighborhood
    // > 30 = 0 points
  }

  // 2. Cell tower match (25 points)
  if (buyer.cellType != null && worker.cellType != null) {
    maxPossible += 25
    if (buyer.cellType === worker.cellType) score += 15
    if (buyer.cellType === worker.cellType && worker.cellCarrier === buyer.cellType) score += 10
  }

  // 3. Barometer consistency (15 points)
  if (buyer.barometer != null && worker.barometer != null) {
    maxPossible += 15
    const diff = Math.abs(buyer.barometer - worker.barometer)
    if (diff < 0.5) score += 15       // same altitude/floor
    else if (diff < 2) score += 8     // nearby altitude
    // > 2 = 0 points
  }

  // 4. Ambient light consistency (15 points)
  if (buyer.ambientLight != null && worker.ambientLight != null) {
    maxPossible += 15
    // Both outdoor (>0.5) or both indoor (<0.3) = match
    const buyerOutdoor = buyer.ambientLight > 0.5
    const workerOutdoor = worker.ambientLight > 0.5
    if (buyerOutdoor === workerOutdoor) score += 15
  }

  // 5. WiFi network overlap (15 points)
  if (buyer.wifiNetworks && worker.wifiNetworks) {
    maxPossible += 15
    try {
      const buyerNets: Array<{ bssid: string }> = JSON.parse(buyer.wifiNetworks)
      const workerNets: Array<{ bssid: string }> = JSON.parse(worker.wifiNetworks)
      const buyerBssids = new Set(buyerNets.map((n) => n.bssid))
      const commonCount = workerNets.filter((n) => buyerBssids.has(n.bssid)).length
      const maxCount = Math.max(buyerNets.length, workerNets.length, 1)
      score += Math.round((commonCount / maxCount) * 15)
    } catch {
      // Invalid JSON — skip WiFi scoring
    }
  }

  // Normalize to 0-100
  return maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0
}
