// eClean — Fraud Detection Engine
//
// Multi-signal fraud detection that combines:
// 1. Photo metadata analysis (EXIF, GPS, timestamps, device)
// 2. Worker behavioral patterns (speed, scores, history)
// 3. Cross-reference with historical data
// 4. AI-detected suspicious activity
//
// Each signal contributes to a composite fraudScore (0.0-1.0).
// The score is weighted — some signals are strong indicators (e.g., GPS 5km away)
// and some are weak (e.g., no EXIF data, which many phones strip).
//
// NEVER auto-reject based on fraud alone — flag for human review.
// False fraud accusations damage worker trust and retention.

import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import type { PhotoSetQualityReport } from './image-quality'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FraudSignal {
  signal: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  weight: number   // 0.0-1.0, contribution to fraud score
  detail: string
  category: 'GPS' | 'TEMPORAL' | 'DEVICE' | 'BEHAVIORAL' | 'PHOTO' | 'HISTORY'
}

export interface FraudReport {
  /** Composite fraud score 0.0-1.0 */
  fraudScore: number
  /** Whether this task should be flagged for manual review */
  isFlagged: boolean
  /** All detected signals */
  signals: FraudSignal[]
  /** Human-readable summary */
  summary: string
}

// ─── Signal Detectors ───────────────────────────────────────────────────────

/**
 * Analyze GPS-based fraud signals.
 * Checks photo GPS vs task location, and consistency across photos.
 */
function detectGpsSignals(
  photoReport: PhotoSetQualityReport,
  taskLat: number | null,
  taskLng: number | null,
): FraudSignal[] {
  const signals: FraudSignal[] = []

  // Check each photo's GPS distance
  for (const [label, report] of Object.entries({
    BEFORE: photoReport.before,
    AFTER: photoReport.after,
    PROOF: photoReport.proof,
  })) {
    for (const check of report.checks) {
      if (check.name === 'gps_distance' && !check.passed) {
        signals.push({
          signal: `${label}_GPS_FAR`,
          severity: check.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          weight: check.severity === 'CRITICAL' ? 0.3 : 0.15,
          detail: check.detail,
          category: 'GPS',
        })
      }
    }
  }

  // Cross-photo GPS inconsistency
  for (const sig of photoReport.crossPhotoSignals) {
    if (sig.includes('km apart')) {
      signals.push({
        signal: 'PHOTOS_GPS_INCONSISTENT',
        severity: 'HIGH',
        weight: 0.25,
        detail: sig,
        category: 'GPS',
      })
    }
  }

  return signals
}

/**
 * Analyze temporal fraud signals.
 * Checks photo timestamps vs task lifecycle.
 */
function detectTemporalSignals(photoReport: PhotoSetQualityReport): FraudSignal[] {
  const signals: FraudSignal[] = []

  for (const sig of photoReport.crossPhotoSignals) {
    if (sig.includes('timestamp is BEFORE') || sig.includes('wrong order')) {
      signals.push({
        signal: 'TEMPORAL_ORDER_WRONG',
        severity: 'HIGH',
        weight: 0.25,
        detail: sig,
        category: 'TEMPORAL',
      })
    }

    if (sig.includes('suspiciously fast')) {
      signals.push({
        signal: 'COMPLETION_TOO_FAST',
        severity: 'MEDIUM',
        weight: 0.15,
        detail: sig,
        category: 'TEMPORAL',
      })
    }

    if (sig.includes('recycled photo')) {
      signals.push({
        signal: 'RECYCLED_PHOTO',
        severity: 'HIGH',
        weight: 0.3,
        detail: sig,
        category: 'TEMPORAL',
      })
    }

    if (sig.includes('unusually long gap')) {
      signals.push({
        signal: 'LARGE_TIME_GAP',
        severity: 'LOW',
        weight: 0.05,
        detail: sig,
        category: 'TEMPORAL',
      })
    }
  }

  return signals
}

/**
 * Analyze device-based fraud signals.
 * Checks device consistency across photos.
 */
function detectDeviceSignals(photoReport: PhotoSetQualityReport): FraudSignal[] {
  const signals: FraudSignal[] = []

  // Multiple devices
  for (const sig of photoReport.crossPhotoSignals) {
    if (sig.includes('different devices')) {
      signals.push({
        signal: 'MULTIPLE_DEVICES',
        severity: 'MEDIUM',
        weight: 0.15,
        detail: sig,
        category: 'DEVICE',
      })
    }
  }

  // No device info on any photo
  const noDeviceCount = [
    photoReport.before,
    photoReport.after,
    photoReport.proof,
  ].filter(r => r.fraudSignals.some(s => s.includes('no device info'))).length

  if (noDeviceCount === 3) {
    signals.push({
      signal: 'ALL_PHOTOS_NO_DEVICE',
      severity: 'MEDIUM',
      weight: 0.1,
      detail: 'All 3 photos have no device info — may be screenshots or downloaded images',
      category: 'DEVICE',
    })
  }

  return signals
}

/**
 * Analyze worker behavioral fraud signals.
 * Checks historical patterns for this specific worker.
 */
async function detectBehavioralSignals(
  workerId: string,
  taskCategory: string,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = []

  try {
    // Check worker's recent fraud flags
    const recentFlags = await prisma.analyticsPhotoMeta.count({
      where: {
        uploaderId: workerId,
        isFlagged: true,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
      },
    })

    if (recentFlags >= 5) {
      signals.push({
        signal: 'REPEAT_FRAUD_FLAGS',
        severity: 'HIGH',
        weight: 0.25,
        detail: `Worker has ${recentFlags} flagged photos in last 30 days`,
        category: 'HISTORY',
      })
    } else if (recentFlags >= 2) {
      signals.push({
        signal: 'SOME_FRAUD_FLAGS',
        severity: 'MEDIUM',
        weight: 0.1,
        detail: `Worker has ${recentFlags} flagged photos in last 30 days`,
        category: 'HISTORY',
      })
    }

    // Check worker's recent rejection rate
    const recentTasks = await prisma.task.findMany({
      where: {
        workerId,
        submittedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { in: ['APPROVED', 'REJECTED', 'COMPLETED'] },
      },
      select: { status: true },
    })

    if (recentTasks.length >= 5) {
      const rejections = recentTasks.filter(t => t.status === 'REJECTED').length
      const rejectionRate = rejections / recentTasks.length

      if (rejectionRate > 0.5) {
        signals.push({
          signal: 'HIGH_REJECTION_RATE',
          severity: 'MEDIUM',
          weight: 0.15,
          detail: `Worker has ${Math.round(rejectionRate * 100)}% rejection rate in last 30 days (${rejections}/${recentTasks.length})`,
          category: 'BEHAVIORAL',
        })
      }
    }

    // Check for rapid submissions (multiple tasks submitted within minutes)
    const recentSubmissions = await prisma.task.findMany({
      where: {
        workerId,
        submittedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // last 2 hours
      },
      select: { submittedAt: true },
      orderBy: { submittedAt: 'desc' },
    })

    if (recentSubmissions.length >= 3) {
      // Check if any two submissions are within 10 minutes of each other
      for (let i = 0; i < recentSubmissions.length - 1; i++) {
        const gap = recentSubmissions[i].submittedAt!.getTime() - recentSubmissions[i + 1].submittedAt!.getTime()
        if (gap < 10 * 60 * 1000) { // 10 minutes
          signals.push({
            signal: 'RAPID_SUBMISSIONS',
            severity: 'MEDIUM',
            weight: 0.1,
            detail: `Worker submitted ${recentSubmissions.length} tasks in last 2 hours with gaps < 10 minutes`,
            category: 'BEHAVIORAL',
          })
          break // only flag once
        }
      }
    }
  } catch (err) {
    // Behavioral checks are non-critical — log and continue
    logger.debug({ err, workerId }, 'Behavioral fraud check failed (non-fatal)')
  }

  return signals
}

// ─── Main Fraud Analysis ────────────────────────────────────────────────────

export interface FraudAnalysisInput {
  workerId: string
  taskCategory: string
  taskLat: number | null
  taskLng: number | null
  photoReport: PhotoSetQualityReport
  aiDetectedSuspicious: boolean // from Claude Vision response
}

/**
 * Run the complete fraud detection pipeline.
 * Combines all signal categories into a composite fraud score.
 */
export async function analyzeFraud(input: FraudAnalysisInput): Promise<FraudReport> {
  const allSignals: FraudSignal[] = []

  // Gather signals from all detectors
  allSignals.push(...detectGpsSignals(input.photoReport, input.taskLat, input.taskLng))
  allSignals.push(...detectTemporalSignals(input.photoReport))
  allSignals.push(...detectDeviceSignals(input.photoReport))
  allSignals.push(...await detectBehavioralSignals(input.workerId, input.taskCategory))

  // AI-detected suspicious activity is a strong signal
  if (input.aiDetectedSuspicious) {
    allSignals.push({
      signal: 'AI_DETECTED_SUSPICIOUS',
      severity: 'HIGH',
      weight: 0.3,
      detail: 'Claude Vision detected suspicious activity in the photos',
      category: 'PHOTO',
    })
  }

  // Compute composite fraud score
  // Use max-weighted approach: the strongest signal anchors the score,
  // additional signals can only increase it (diminishing returns)
  let fraudScore = 0
  const sorted = [...allSignals].sort((a, b) => b.weight - a.weight)

  for (let i = 0; i < sorted.length; i++) {
    // Each subsequent signal contributes less (diminishing returns)
    const diminish = 1 / (i + 1)
    fraudScore += sorted[i].weight * diminish
  }

  // Clamp to 0.0-1.0
  fraudScore = Math.min(1.0, Math.max(0.0, fraudScore))
  fraudScore = Math.round(fraudScore * 100) / 100

  // Flag threshold: 0.4 = enough signals to warrant human review
  const isFlagged = fraudScore >= 0.4

  // Build summary
  let summary: string
  if (allSignals.length === 0) {
    summary = 'No fraud signals detected. Photos appear genuine.'
  } else if (fraudScore < 0.2) {
    summary = `Minor anomalies detected (${allSignals.length} signals) but likely not fraudulent.`
  } else if (fraudScore < 0.4) {
    summary = `Some concerning signals detected (${allSignals.length}). Score: ${fraudScore}. Within acceptable range but worth noting.`
  } else if (fraudScore < 0.7) {
    summary = `Multiple fraud indicators detected (${allSignals.length} signals, score: ${fraudScore}). Flagged for manual review.`
  } else {
    summary = `Strong fraud indicators detected (${allSignals.length} signals, score: ${fraudScore}). High probability of fraudulent submission.`
  }

  return {
    fraudScore,
    isFlagged,
    signals: allSignals,
    summary,
  }
}
