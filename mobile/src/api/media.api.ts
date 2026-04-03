import { apiClient } from './client'
import * as ImageManipulator from 'expo-image-manipulator'
import type { TaskMedia, MediaType } from '../types'

const MAX_DIMENSION = 1200
const COMPRESS_QUALITY = 0.75

async function compressPhoto(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    )
    return result.uri
  } catch {
    return uri
  }
}

/** Metadata captured on-device — GPS from expo-location, hash from expo-crypto */
export interface PhotoMetadata {
  lat:       number | null
  lng:       number | null
  timestamp: string        // ISO UTC
  deviceId:  string
  photoHash: string        // SHA-256 of raw photo bytes
}

export const mediaApi = {
  /**
   * Upload photo with device-captured metadata.
   * Backend receives: file + mediaType + lat/lng/timestamp/deviceId/photoHash
   * This supplements EXIF (which gets stripped by compression).
   */
  upload: async (
    taskId: string,
    uri: string,
    mediaType: MediaType,
    metadata?: PhotoMetadata,
    onProgress?: (pct: number) => void,
  ): Promise<TaskMedia> => {
    // Resize to 1200px max width for 3G upload speed (48MP Redmi = 5MB → ~400KB)
    const compressedUri = await compressPhoto(uri)

    const formData = new FormData()
    formData.append('file', {
      uri: compressedUri,
      name: `${mediaType.toLowerCase()}_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob)

    formData.append('mediaType', mediaType)

    // Send device-captured metadata alongside the photo
    if (metadata) {
      if (metadata.lat != null) formData.append('capturedLat', String(metadata.lat))
      if (metadata.lng != null) formData.append('capturedLng', String(metadata.lng))
      if (metadata.timestamp)   formData.append('capturedAt', metadata.timestamp)
      if (metadata.deviceId)    formData.append('deviceId', metadata.deviceId)
      if (metadata.photoHash)   formData.append('photoHash', metadata.photoHash)
    }

    // Idempotency key: taskId + mediaType + timestamp — prevents duplicate uploads on retry
    const idempotencyKey = `${taskId}-${mediaType}-${metadata?.photoHash ?? Date.now()}`

    const res = await apiClient.post<{ media: TaskMedia }>(
      `/tasks/${taskId}/media`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Idempotency-Key': idempotencyKey,
        },
        timeout: 30_000,
        onUploadProgress: onProgress
          ? (e) => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
          : undefined,
      },
    )
    return res.data.media
  },

  list: (taskId: string) =>
    apiClient.get<{ media: TaskMedia[] }>(`/tasks/${taskId}/media`).then((r) => r.data.media),
}
