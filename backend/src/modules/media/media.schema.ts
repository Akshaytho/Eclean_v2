import { z } from 'zod'

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export const TASK_MEDIA_TYPES = ['BEFORE', 'AFTER', 'PROOF', 'REFERENCE'] as const
export type TaskMediaType = (typeof TASK_MEDIA_TYPES)[number]

export const uploadMediaFieldSchema = z.object({
  mediaType: z.enum(TASK_MEDIA_TYPES),
})

export const taskIdParamSchema = z.object({
  taskId: z.string().min(1),
})

export type UploadMediaField = z.infer<typeof uploadMediaFieldSchema>
export type MediaTaskIdParam = z.infer<typeof taskIdParamSchema>
