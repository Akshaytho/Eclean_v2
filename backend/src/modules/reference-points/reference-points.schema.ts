import { z } from 'zod'

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_REFERENCE_POINTS = 10
export const MIN_REFERENCE_POINTS_BY_SIZE: Record<string, number> = {
  SMALL: 2,
  MEDIUM: 3,
  LARGE: 5,
}

// ─── Params ──────────────────────────────────────────────────────────────────

export const taskIdParamSchema = z.object({
  taskId: z.string().uuid(),
})

export const pointIdParamSchema = z.object({
  taskId: z.string().uuid(),
  pointId: z.string().uuid(),
})

export const pointSubmitParamSchema = z.object({
  taskId: z.string().uuid(),
  pointId: z.string().uuid(),
})

// ─── Reference point upload fields (parsed from multipart) ───────────────────

export const addReferencePointFieldSchema = z.object({
  pointIndex: z.coerce.number().int().min(1).max(MAX_REFERENCE_POINTS),
  label: z.string().max(100).optional(),
  capturedLat: z.coerce.number().min(-90).max(90).optional(),
  capturedLng: z.coerce.number().min(-180).max(180).optional(),
  capturedAt: z.string().optional(),
  photoHash: z.string().optional(),
})

// ─── Worker point submission fields (parsed from multipart) ──────────────────

export const WORKER_SUBMISSION_MEDIA_TYPES = ['AFTER', 'VERIFICATION'] as const

export const submitPointFieldSchema = z.object({
  mediaType: z.enum(WORKER_SUBMISSION_MEDIA_TYPES),
  capturedLat: z.coerce.number().min(-90).max(90).optional(),
  capturedLng: z.coerce.number().min(-180).max(180).optional(),
  capturedAt: z.string().optional(),
  deviceId: z.string().optional(),
  photoHash: z.string().optional(),
})

// ─── Submission progress query ───────────────────────────────────────────────

export const progressQuerySchema = z.object({
  workerLat: z.coerce.number().min(-90).max(90).optional(),
  workerLng: z.coerce.number().min(-180).max(180).optional(),
})
