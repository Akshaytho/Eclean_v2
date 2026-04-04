import { z } from 'zod'

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export const TASK_MEDIA_TYPES = ['BEFORE', 'AFTER', 'PROOF', 'REFERENCE', 'VERIFICATION', 'ARRIVAL'] as const
export type TaskMediaType = (typeof TASK_MEDIA_TYPES)[number]

export const uploadMediaFieldSchema = z.object({
  mediaType: z.enum(TASK_MEDIA_TYPES),
})

export const taskIdParamSchema = z.object({
  taskId: z.string().min(1),
})

// SECURITY: validate device-captured metadata fields (prevents garbage coordinates, overlong strings)
export const deviceMetaSchema = z.object({
  capturedLat: z.number().min(-90).max(90).nullable(),
  capturedLng: z.number().min(-180).max(180).nullable(),
  capturedAt:  z.string().max(50).nullable(),      // ISO timestamp
  deviceId:    z.string().max(100).nullable(),
  photoHash:   z.string().max(128).nullable(),      // SHA-256 hex = 64 chars
})
export type DeviceMeta = z.infer<typeof deviceMetaSchema>

export type UploadMediaField = z.infer<typeof uploadMediaFieldSchema>
export type MediaTaskIdParam = z.infer<typeof taskIdParamSchema>
