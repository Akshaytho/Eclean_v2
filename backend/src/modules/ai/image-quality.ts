// eClean — Image Quality Pre-Screening
//
// BEFORE sending images to Claude Vision (which costs money per call),
// this module performs fast, cheap quality checks on the uploaded photos.
//
// Goals:
// 1. Reject obviously unusable images before wasting API tokens
// 2. Generate quality signals that feed into the fraud detection engine
// 3. Detect basic image manipulation (resolution mismatches, metadata anomalies)
//
// This runs on the photo metadata and EXIF data already extracted during upload.
// It does NOT re-download or re-process the images — zero extra I/O.

import { logger } from '../../lib/logger'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImageQualityReport {
  /** Overall quality score 0.0-1.0 */
  score: number
  /** Whether the image passes minimum quality bar */
  passesMinimum: boolean
  /** Individual check results */
  checks: QualityCheck[]
  /** Signals that should be passed to fraud detection */
  fraudSignals: string[]
}

interface QualityCheck {
  name: string
  passed: boolean
  detail: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
}

export interface PhotoMetadata {
  url: string
  mimeType: string | null
  sizeBytes: number | null
  mediaType: string  // BEFORE, AFTER, PROOF
  // From AnalyticsPhotoMeta
  exifLat: number | null
  exifLng: number | null
  exifTimestamp: Date | null
  deviceMake: string | null
  deviceModel: string | null
  imageWidth: number | null
  imageHeight: number | null
  distanceFromTaskMeters: number | null
  isFlagged: boolean
  flagReason: string | null
}

// ─── Quality Thresholds ─────────────────────────────────────────────────────

const MIN_RESOLUTION_WIDTH  = 640   // at least 640px wide
const MIN_RESOLUTION_HEIGHT = 480   // at least 480px tall
const MAX_RESOLUTION_WIDTH  = 8000  // suspiciously large = stock photo
const MAX_RESOLUTION_HEIGHT = 8000
const MIN_FILE_SIZE_BYTES   = 50_000    // 50KB — smaller is likely a thumbnail
const MAX_FILE_SIZE_BYTES   = 15_000_000 // 15MB — larger than phone cameras produce
const MAX_GPS_DISTANCE_METERS = 500     // distance flag threshold
const MAX_TIMESTAMP_DRIFT_HOURS = 24    // photo should be taken within 24h of task

// ─── Main Quality Assessment ────────────────────────────────────────────────

/**
 * Assess quality of a single photo from its metadata.
 * Does NOT download or analyze the image content — uses only metadata.
 */
export function assessImageQuality(photo: PhotoMetadata): ImageQualityReport {
  const checks: QualityCheck[] = []
  const fraudSignals: string[] = []

  // Check 1: Resolution
  if (photo.imageWidth !== null && photo.imageHeight !== null) {
    if (photo.imageWidth < MIN_RESOLUTION_WIDTH || photo.imageHeight < MIN_RESOLUTION_HEIGHT) {
      checks.push({
        name: 'resolution_minimum',
        passed: false,
        detail: `Image too small: ${photo.imageWidth}x${photo.imageHeight} (min: ${MIN_RESOLUTION_WIDTH}x${MIN_RESOLUTION_HEIGHT})`,
        severity: 'WARNING',
      })
    } else if (photo.imageWidth > MAX_RESOLUTION_WIDTH || photo.imageHeight > MAX_RESOLUTION_HEIGHT) {
      checks.push({
        name: 'resolution_maximum',
        passed: false,
        detail: `Image suspiciously large: ${photo.imageWidth}x${photo.imageHeight} — may be a stock/downloaded image`,
        severity: 'WARNING',
      })
      fraudSignals.push(`${photo.mediaType} photo resolution ${photo.imageWidth}x${photo.imageHeight} exceeds phone camera norms`)
    } else {
      checks.push({
        name: 'resolution',
        passed: true,
        detail: `Resolution OK: ${photo.imageWidth}x${photo.imageHeight}`,
        severity: 'INFO',
      })
    }
  } else {
    checks.push({
      name: 'resolution',
      passed: true, // can't check, don't block
      detail: 'Resolution metadata unavailable',
      severity: 'INFO',
    })
  }

  // Check 2: File size
  if (photo.sizeBytes !== null) {
    if (photo.sizeBytes < MIN_FILE_SIZE_BYTES) {
      checks.push({
        name: 'file_size_minimum',
        passed: false,
        detail: `File too small: ${(photo.sizeBytes / 1024).toFixed(0)}KB (min: ${MIN_FILE_SIZE_BYTES / 1024}KB)`,
        severity: 'WARNING',
      })
      fraudSignals.push(`${photo.mediaType} photo only ${(photo.sizeBytes / 1024).toFixed(0)}KB — may be a screenshot or thumbnail`)
    } else if (photo.sizeBytes > MAX_FILE_SIZE_BYTES) {
      checks.push({
        name: 'file_size_maximum',
        passed: false,
        detail: `File unusually large: ${(photo.sizeBytes / 1024 / 1024).toFixed(1)}MB`,
        severity: 'INFO',
      })
    } else {
      checks.push({
        name: 'file_size',
        passed: true,
        detail: `File size OK: ${(photo.sizeBytes / 1024).toFixed(0)}KB`,
        severity: 'INFO',
      })
    }
  }

  // Check 3: MIME type
  const validMimes = ['image/jpeg', 'image/png', 'image/webp']
  if (photo.mimeType && !validMimes.includes(photo.mimeType)) {
    checks.push({
      name: 'mime_type',
      passed: false,
      detail: `Unexpected MIME type: ${photo.mimeType}`,
      severity: 'WARNING',
    })
  } else {
    checks.push({
      name: 'mime_type',
      passed: true,
      detail: `MIME type OK: ${photo.mimeType ?? 'unknown'}`,
      severity: 'INFO',
    })
  }

  // Check 4: GPS distance
  if (photo.isFlagged) {
    checks.push({
      name: 'gps_distance',
      passed: false,
      detail: photo.flagReason ?? `GPS distance exceeds ${MAX_GPS_DISTANCE_METERS}m`,
      severity: 'CRITICAL',
    })
    fraudSignals.push(photo.flagReason ?? `${photo.mediaType} photo GPS too far from task location`)
  } else if (photo.distanceFromTaskMeters !== null) {
    checks.push({
      name: 'gps_distance',
      passed: true,
      detail: `GPS ${photo.distanceFromTaskMeters}m from task location`,
      severity: 'INFO',
    })
  } else {
    checks.push({
      name: 'gps_distance',
      passed: true, // no GPS data = can't check, don't block
      detail: 'No GPS data in photo EXIF',
      severity: 'INFO',
    })
  }

  // Check 5: Device info present
  if (!photo.deviceMake && !photo.deviceModel) {
    checks.push({
      name: 'device_info',
      passed: true, // informational only
      detail: 'No device info in EXIF — may be a screenshot or processed image',
      severity: 'INFO',
    })
    fraudSignals.push(`${photo.mediaType} photo has no device info — possible screenshot or internet image`)
  } else {
    checks.push({
      name: 'device_info',
      passed: true,
      detail: `Device: ${photo.deviceMake ?? ''} ${photo.deviceModel ?? ''}`.trim(),
      severity: 'INFO',
    })
  }

  // Calculate overall score
  const totalChecks = checks.length
  const passedChecks = checks.filter(c => c.passed).length
  const criticalFails = checks.filter(c => !c.passed && c.severity === 'CRITICAL').length
  const warningFails = checks.filter(c => !c.passed && c.severity === 'WARNING').length

  let score: number
  if (criticalFails > 0) {
    score = Math.max(0.1, 0.5 - (criticalFails * 0.2))
  } else if (warningFails > 0) {
    score = Math.max(0.4, 0.8 - (warningFails * 0.15))
  } else {
    score = 0.8 + (passedChecks / totalChecks) * 0.2
  }

  return {
    score: Math.round(score * 100) / 100,
    passesMinimum: criticalFails === 0 && warningFails <= 2,
    checks,
    fraudSignals,
  }
}

// ─── Assess complete photo set ──────────────────────────────────────────────

export interface PhotoSetQualityReport {
  overall: number
  passesMinimum: boolean
  before: ImageQualityReport
  after: ImageQualityReport
  proof: ImageQualityReport
  crossPhotoSignals: string[]
}

/**
 * Assess the quality of the complete BEFORE/AFTER/PROOF photo set.
 * Also performs cross-photo checks (device consistency, temporal order, etc.)
 */
export function assessPhotoSet(
  before: PhotoMetadata,
  after: PhotoMetadata,
  proof: PhotoMetadata,
  taskStartedAt: Date | null,
  taskSubmittedAt: Date | null,
): PhotoSetQualityReport {
  const beforeReport = assessImageQuality(before)
  const afterReport = assessImageQuality(after)
  const proofReport = assessImageQuality(proof)

  const crossPhotoSignals: string[] = []

  // Cross-check 1: Device consistency
  const devices = new Set<string>()
  for (const p of [before, after, proof]) {
    if (p.deviceMake || p.deviceModel) {
      devices.add(`${p.deviceMake ?? ''}|${p.deviceModel ?? ''}`)
    }
  }
  if (devices.size > 1) {
    crossPhotoSignals.push(
      `Photos taken with ${devices.size} different devices — BEFORE/AFTER/PROOF should all be from the same phone`,
    )
  }

  // Cross-check 2: Temporal order
  if (before.exifTimestamp && after.exifTimestamp) {
    if (after.exifTimestamp <= before.exifTimestamp) {
      crossPhotoSignals.push(
        'AFTER photo timestamp is BEFORE the BEFORE photo — photos may be in wrong order or manipulated',
      )
    }
  }

  if (before.exifTimestamp && proof.exifTimestamp) {
    if (proof.exifTimestamp < before.exifTimestamp) {
      crossPhotoSignals.push(
        'PROOF photo timestamp is before BEFORE photo — proof should be taken during or after work',
      )
    }
  }

  // Cross-check 3: Timestamps vs task lifecycle
  if (taskStartedAt && before.exifTimestamp) {
    const hoursBeforeStart = (taskStartedAt.getTime() - before.exifTimestamp.getTime()) / (1000 * 60 * 60)
    if (hoursBeforeStart > MAX_TIMESTAMP_DRIFT_HOURS) {
      crossPhotoSignals.push(
        `BEFORE photo taken ${Math.round(hoursBeforeStart)} hours before task started — may be a recycled photo`,
      )
    }
  }

  if (taskSubmittedAt && after.exifTimestamp) {
    const hoursAfterSubmit = (after.exifTimestamp.getTime() - taskSubmittedAt.getTime()) / (1000 * 60 * 60)
    if (hoursAfterSubmit > MAX_TIMESTAMP_DRIFT_HOURS) {
      crossPhotoSignals.push(
        `AFTER photo timestamp ${Math.round(hoursAfterSubmit)} hours after submission — suspicious timing`,
      )
    }
  }

  // Cross-check 4: GPS consistency across photos
  const gpsPoints = [before, after, proof]
    .filter(p => p.exifLat !== null && p.exifLng !== null)
    .map(p => ({ lat: p.exifLat!, lng: p.exifLng!, type: p.mediaType }))

  if (gpsPoints.length >= 2) {
    for (let i = 0; i < gpsPoints.length; i++) {
      for (let j = i + 1; j < gpsPoints.length; j++) {
        const dist = haversineMeters(
          gpsPoints[i].lat, gpsPoints[i].lng,
          gpsPoints[j].lat, gpsPoints[j].lng,
        )
        if (dist > 1000) { // 1km between photos = suspicious
          crossPhotoSignals.push(
            `${gpsPoints[i].type} and ${gpsPoints[j].type} photos are ${(dist / 1000).toFixed(1)}km apart — should be at same location`,
          )
        }
      }
    }
  }

  // Cross-check 5: Completion time sanity
  if (before.exifTimestamp && after.exifTimestamp) {
    const workMinutes = (after.exifTimestamp.getTime() - before.exifTimestamp.getTime()) / (1000 * 60)
    if (workMinutes < 2) {
      crossPhotoSignals.push(
        `Only ${Math.round(workMinutes)} minutes between BEFORE and AFTER photos — suspiciously fast`,
      )
    }
    if (workMinutes > 480) { // 8 hours
      crossPhotoSignals.push(
        `${Math.round(workMinutes / 60)} hours between BEFORE and AFTER photos — unusually long gap`,
      )
    }
  }

  // Overall score
  const avgScore = (beforeReport.score + afterReport.score + proofReport.score) / 3
  const crossPenalty = Math.min(crossPhotoSignals.length * 0.1, 0.3)
  const overall = Math.max(0.1, avgScore - crossPenalty)

  return {
    overall: Math.round(overall * 100) / 100,
    passesMinimum: beforeReport.passesMinimum && afterReport.passesMinimum && proofReport.passesMinimum,
    before: beforeReport,
    after: afterReport,
    proof: proofReport,
    crossPhotoSignals,
  }
}

// ─── Haversine (local copy to avoid cross-module deps) ──────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
