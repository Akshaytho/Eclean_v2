import { apiClient } from './client'
import * as ImageManipulator from 'expo-image-manipulator'
import type {
  TaskReferencePoint,
  WorkerPointSubmission,
  SubmissionProgress,
} from '../types'
import type { PhotoMetadata } from './media.api'

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
  } catch (err) {
    console.warn('[compressPhoto] Compression failed, using original:', (err as Error)?.message)
    return uri
  }
}

export const referencePointsApi = {
  /**
   * Buyer uploads a reference point image with metadata.
   * Called after task creation — one call per reference photo.
   */
  upload: async (
    taskId: string,
    pointIndex: number,
    uri: string,
    label?: string,
    metadata?: PhotoMetadata,
  ): Promise<TaskReferencePoint> => {
    const compressedUri = await compressPhoto(uri)
    const formData = new FormData()
    formData.append('file', {
      uri: compressedUri,
      name: `ref_${pointIndex}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob)
    formData.append('pointIndex', String(pointIndex))
    if (label) formData.append('label', label)
    if (metadata?.lat != null) formData.append('capturedLat', String(metadata.lat))
    if (metadata?.lng != null) formData.append('capturedLng', String(metadata.lng))
    if (metadata?.photoHash) formData.append('photoHash', metadata.photoHash)

    const idempotencyKey = `${taskId}-ref-${pointIndex}-${metadata?.photoHash ?? Date.now()}`

    const res = await apiClient.post<{ referencePoint: TaskReferencePoint }>(
      `/tasks/${taskId}/reference-points`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Idempotency-Key': idempotencyKey,
        },
        timeout: 30_000,
      },
    )
    return res.data.referencePoint
  },

  /** Get all reference points for a task. */
  list: (taskId: string): Promise<TaskReferencePoint[]> =>
    apiClient
      .get<{ referencePoints: TaskReferencePoint[] }>(`/tasks/${taskId}/reference-points`)
      .then((r) => r.data.referencePoints),

  /** Buyer removes a reference point (before task is accepted only). */
  remove: (taskId: string, pointId: string) =>
    apiClient.delete(`/tasks/${taskId}/reference-points/${pointId}`),

  /**
   * Worker submits a photo for a specific reference point.
   * Backend computes GPS match score automatically.
   */
  submitPoint: async (
    taskId: string,
    referencePointId: string,
    mediaType: 'AFTER' | 'VERIFICATION',
    uri: string,
    metadata?: PhotoMetadata,
  ): Promise<WorkerPointSubmission> => {
    // Skip compression — camera already captures at quality 0.7 and
    // Cloudinary handles server-side optimization. Double compression
    // was adding 1-2 seconds per upload on budget phones.
    const compressedUri = uri
    const formData = new FormData()
    formData.append('file', {
      uri: compressedUri,
      name: `${mediaType.toLowerCase()}_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob)
    formData.append('mediaType', mediaType)
    if (metadata?.lat != null) formData.append('capturedLat', String(metadata.lat))
    if (metadata?.lng != null) formData.append('capturedLng', String(metadata.lng))
    if (metadata?.photoHash) formData.append('photoHash', metadata.photoHash)

    const idempotencyKey = `${taskId}-${referencePointId}-${metadata?.photoHash ?? Date.now()}`

    const res = await apiClient.post<{ submission: WorkerPointSubmission }>(
      `/tasks/${taskId}/points/${referencePointId}/submit`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Idempotency-Key': idempotencyKey,
        },
        timeout: 30_000,
      },
    )
    return res.data.submission
  },

  /**
   * Get worker's capture progress — which points are done, which remain.
   * Pass workerLat/Lng to reveal verification points within 50m.
   */
  progress: (
    taskId: string,
    workerLat?: number,
    workerLng?: number,
  ): Promise<SubmissionProgress> => {
    const params: Record<string, string> = {}
    if (workerLat != null) params.workerLat = String(workerLat)
    if (workerLng != null) params.workerLng = String(workerLng)
    return apiClient
      .get<SubmissionProgress>(`/tasks/${taskId}/submission-progress`, { params })
      .then((r) => r.data)
  },
}
