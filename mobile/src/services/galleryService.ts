/**
 * galleryService — eClean's own in-app photo storage.
 *
 * WHY WE DON'T USE PHONE GALLERY:
 * - expo-media-library saves to phone gallery (visible in Photos app)
 * - That gives workers access to upload old photos as evidence
 * - Our photos are evidence, not memories — they belong in the app
 *
 * HOW IT WORKS:
 * - Photos stored in expo-file-system DocumentDirectory (app-private)
 * - Organized by: gallery/{taskId}/{photoType}/{timestamp}.jpg
 * - Thumbnails generated at 200px for grid display (keeps gallery fast)
 * - Full resolution kept separately for AI upload
 * - Metadata stored as JSON alongside each photo
 * - Gallery reads thumbnails only — never loads full-res into memory for lists
 *
 * PERFORMANCE:
 * - Thumbnails: ~5-15KB each — a 100-photo grid loads in <1 second
 * - Full res: ~200-400KB (after compression) — loaded only when needed
 * - FlatList with getItemLayout for instant scroll
 */

import * as FileSystem from 'expo-file-system/legacy'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'

const GALLERY_DIR = `${FileSystem.documentDirectory}eclean_gallery/`
const THUMB_SIZE  = 200   // px — thumbnail dimensions for gallery grid
const MAX_FULL_PX = 1200  // px — max dimension for full-res upload

export interface GalleryPhoto {
  id:           string        // unique — timestamp + random
  taskId:       string | null // null = dashboard quick capture
  photoType:    'BEFORE' | 'AFTER' | 'PROOF' | 'GENERAL'
  fullUri:      string        // full-res file path
  thumbUri:     string        // thumbnail file path
  uploadedUri:  string | null // Cloudinary URL after upload
  metadata: {
    lat:        number | null
    lng:        number | null
    timestamp:  string        // ISO UTC — captured at shutter press
    deviceId:   string
    taskId:     string | null
    photoHash:  string        // SHA-256 — tamper-proof evidence
  }
  capturedAt:   string        // ISO UTC
  uploaded:     boolean
}

// ── Ensure gallery directories exist ──────────────────────────────────────────
async function ensureDir(dir: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dir)
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    }
  } catch {
    // Directory might already exist or getInfoAsync deprecated — try creating directly
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    } catch {
      // Already exists — fine
    }
  }
}

// ── Generate unique photo ID ───────────────────────────────────────────────────
function photoId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Save a photo into the gallery ─────────────────────────────────────────────
export async function saveToGallery(
  sourceUri:  string,
  taskId:     string | null,
  photoType:  GalleryPhoto['photoType'],
  metadata:   GalleryPhoto['metadata'],
): Promise<GalleryPhoto> {
  const id        = photoId()
  const folder    = taskId ? `${GALLERY_DIR}${taskId}/` : `${GALLERY_DIR}general/`
  const fullDir   = `${folder}full/`
  const thumbDir  = `${folder}thumbs/`

  await ensureDir(fullDir)
  await ensureDir(thumbDir)

  // Compress full-res (max 1200px, 85% quality)
  const compressed = await manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_FULL_PX } }],
    { compress: 0.85, format: SaveFormat.JPEG }
  )

  // Generate thumbnail (200px, 70% quality — tiny but clear enough for grid)
  const thumb = await manipulateAsync(
    sourceUri,
    [{ resize: { width: THUMB_SIZE } }],  // width only — height scales proportionally, no distortion
    { compress: 0.7, format: SaveFormat.JPEG }
  )

  const fullUri  = `${fullDir}${id}.jpg`
  const thumbUri = `${thumbDir}${id}_thumb.jpg`

  await FileSystem.copyAsync({ from: compressed.uri, to: fullUri })
  await FileSystem.copyAsync({ from: thumb.uri,      to: thumbUri })

  const photo: GalleryPhoto = {
    id,
    taskId,
    photoType,
    fullUri,
    thumbUri,
    uploadedUri:  null,
    metadata,
    capturedAt:   new Date().toISOString(),
    uploaded:     false,
  }

  // Save metadata JSON alongside
  await FileSystem.writeAsStringAsync(
    `${fullDir}${id}.json`,
    JSON.stringify(photo, null, 2)
  )

  return photo
}

// ── List all photos for a task ─────────────────────────────────────────────────
export async function getTaskPhotos(taskId: string): Promise<GalleryPhoto[]> {
  const folder  = `${GALLERY_DIR}${taskId}/full/`
  const info    = await FileSystem.getInfoAsync(folder)
  if (!info.exists) return []

  const files = await FileSystem.readDirectoryAsync(folder)
  const jsons = files.filter(f => f.endsWith('.json'))

  const photos: GalleryPhoto[] = []
  for (const file of jsons) {
    try {
      const raw  = await FileSystem.readAsStringAsync(`${folder}${file}`)
      photos.push(JSON.parse(raw) as GalleryPhoto)
    } catch {
      // corrupt metadata — skip
    }
  }

  return photos.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
}

// ── List all photos (for gallery screen) ──────────────────────────────────────
export async function getAllPhotos(): Promise<GalleryPhoto[]> {
  await ensureDir(GALLERY_DIR)
  const taskDirs = await FileSystem.readDirectoryAsync(GALLERY_DIR)
  const all: GalleryPhoto[] = []

  for (const dir of taskDirs) {
    const fullDir = `${GALLERY_DIR}${dir}/full/`
    const info    = await FileSystem.getInfoAsync(fullDir)
    if (!info.exists) continue

    const files = await FileSystem.readDirectoryAsync(fullDir)
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const raw = await FileSystem.readAsStringAsync(`${fullDir}${file}`)
        all.push(JSON.parse(raw) as GalleryPhoto)
      } catch {
        // skip corrupt
      }
    }
  }

  return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)) // newest first
}

// ── Mark photo as uploaded (after Cloudinary upload) ──────────────────────────
export async function markUploaded(
  photo:       GalleryPhoto,
  uploadedUri: string,
): Promise<GalleryPhoto> {
  const updated = { ...photo, uploaded: true, uploadedUri }
  const folder  = photo.taskId ? `${GALLERY_DIR}${photo.taskId}/full/` : `${GALLERY_DIR}general/full/`

  await FileSystem.writeAsStringAsync(
    `${folder}${photo.id}.json`,
    JSON.stringify(updated, null, 2)
  )
  return updated
}

// ── Delete a photo (retake) ───────────────────────────────────────────────────
export async function deletePhoto(photo: GalleryPhoto): Promise<void> {
  await Promise.allSettled([
    FileSystem.deleteAsync(photo.fullUri,  { idempotent: true }),
    FileSystem.deleteAsync(photo.thumbUri, { idempotent: true }),
    FileSystem.deleteAsync(photo.fullUri.replace('.jpg', '.json'), { idempotent: true }),
  ])
}

// ── Get gallery stats ─────────────────────────────────────────────────────────
export async function getGalleryStats(): Promise<{ count: number; sizeMB: number }> {
  const info = await FileSystem.getInfoAsync(GALLERY_DIR, { size: true })
  if (!info.exists) return { count: 0, sizeMB: 0 }
  const all = await getAllPhotos()
  return {
    count:  all.length,
    sizeMB: Math.round(((info as any).size ?? 0) / 1024 / 1024 * 10) / 10,
  }
}

// ── Clear old photos (>30 days, already uploaded) ─────────────────────────────
export async function cleanOldPhotos(): Promise<number> {
  const all     = await getAllPhotos()
  const cutoff  = Date.now() - 30 * 24 * 60 * 60 * 1000
  let deleted   = 0

  for (const photo of all) {
    const age = new Date(photo.capturedAt).getTime()
    if (photo.uploaded && age < cutoff) {
      await deletePhoto(photo)
      deleted++
    }
  }
  return deleted
}
