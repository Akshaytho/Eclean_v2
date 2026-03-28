// eClean — EXIF metadata extraction
//
// Extracts GPS coordinates, timestamp, and device info from photo buffers
// BEFORE they are uploaded to Cloudinary (which strips EXIF by default).
//
// This data is irreplaceable — once the photo is uploaded without extracting
// EXIF first, the GPS/timestamp/device info is permanently lost.
//
// Uses `exifr` — a lightweight (50KB), fast EXIF parser that works with Buffers.
// Only parses the EXIF header, never loads the full image into memory.
//
// NEVER THROWS — returns null fields on failure. EXIF extraction must never
// block or fail the photo upload itself.

import { logger } from './logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExifData {
  lat:         number | null  // GPS latitude from photo
  lng:         number | null  // GPS longitude from photo
  timestamp:   Date   | null  // when the photo was actually taken (DateTimeOriginal)
  altitude:    number | null  // meters above sea level
  make:        string | null  // camera manufacturer: "Samsung", "Apple"
  model:       string | null  // camera model: "SM-A536B", "iPhone 14 Pro"
  imageWidth:  number | null  // original resolution width
  imageHeight: number | null  // original resolution height
}

// ─── Haversine (duplicated from tasks.service.ts to avoid cross-module import) ─

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Extract EXIF metadata from a photo buffer.
 *
 * Returns an ExifData object with all nullable fields — some phones
 * don't include GPS, some strip timestamps, some have no EXIF at all.
 *
 * NEVER THROWS. On any failure, returns an ExifData with all nulls.
 */
export async function extractExif(buffer: Buffer): Promise<ExifData> {
  const empty: ExifData = {
    lat: null, lng: null, timestamp: null, altitude: null,
    make: null, model: null, imageWidth: null, imageHeight: null,
  }

  try {
    // Dynamic import — exifr is ESM-only in newer versions.
    // Using dynamic import so it works in both CJS and ESM environments.
    const exifr = await import('exifr')

    const parsed = await exifr.parse(buffer, {
      // Only parse what we need — skip all other EXIF tags for speed
      pick: [
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
        'DateTimeOriginal', 'CreateDate', 'ModifyDate',
        'Make', 'Model',
        'ImageWidth', 'ImageHeight',
        'ExifImageWidth', 'ExifImageHeight',
      ],
      // Enable GPS coordinate conversion (raw → decimal degrees)
      gps: true,
    })

    if (!parsed) return empty

    return {
      lat:         typeof parsed.latitude  === 'number' ? parsed.latitude  : null,
      lng:         typeof parsed.longitude === 'number' ? parsed.longitude : null,
      timestamp:   parsed.DateTimeOriginal instanceof Date ? parsed.DateTimeOriginal
                 : parsed.CreateDate       instanceof Date ? parsed.CreateDate
                 : parsed.ModifyDate       instanceof Date ? parsed.ModifyDate
                 : null,
      altitude:    typeof parsed.GPSAltitude === 'number' ? parsed.GPSAltitude : null,
      make:        typeof parsed.Make  === 'string' ? parsed.Make.trim()  : null,
      model:       typeof parsed.Model === 'string' ? parsed.Model.trim() : null,
      imageWidth:  parsed.ExifImageWidth  ?? parsed.ImageWidth  ?? null,
      imageHeight: parsed.ExifImageHeight ?? parsed.ImageHeight ?? null,
    }
  } catch (err) {
    // EXIF parsing failure — could be a PNG (no EXIF), a corrupted header,
    // or an unsupported format. Log and return empty — never block the upload.
    logger.debug({ err }, 'EXIF extraction failed — photo may not have EXIF data (non-fatal)')
    return empty
  }
}

// ─── Distance computation ─────────────────────────────────────────────────────

/**
 * Compute the distance between EXIF GPS and task location.
 * Returns distance in meters, or null if either coordinate pair is missing.
 *
 * Also returns a fraud flag:
 *   - isFlagged: true if distance > 500 meters
 *   - flagReason: human-readable explanation
 */
export function computePhotoDistance(
  exifLat: number | null,
  exifLng: number | null,
  taskLat: number | null,
  taskLng: number | null,
): { distanceMeters: number | null; isFlagged: boolean; flagReason: string | null } {
  if (exifLat === null || exifLng === null || taskLat === null || taskLng === null) {
    return { distanceMeters: null, isFlagged: false, flagReason: null }
  }

  const distanceMeters = Math.round(haversineMeters(exifLat, exifLng, taskLat, taskLng))

  if (distanceMeters > 500) {
    return {
      distanceMeters,
      isFlagged: true,
      flagReason: `Photo EXIF GPS is ${(distanceMeters / 1000).toFixed(1)}km from task location`,
    }
  }

  return { distanceMeters, isFlagged: false, flagReason: null }
}
