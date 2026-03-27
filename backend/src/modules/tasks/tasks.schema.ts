import { z } from 'zod'
import { TaskCategory, DirtyLevel, TaskUrgency, TaskStatus } from '@prisma/client'

// ─── Dirty level pricing (integer cents) ─────────────────────────────────────
// Rule: money is always integer cents, never floats
export const DIRTY_LEVEL_PRICING: Record<DirtyLevel, { default: number; min: number }> = {
  LIGHT:    { default: 3000,  min: 2000 },
  MEDIUM:   { default: 6000,  min: 4000 },
  HEAVY:    { default: 12000, min: 8000  },
  CRITICAL: { default: 18000, min: 12000 },
}

// ─── Task creation ─────────────────────────────────────────────────────────────
export const createTaskSchema = z.object({
  title:           z.string().min(5).max(200),
  description:     z.string().min(10).max(2000),
  category:        z.nativeEnum(TaskCategory),
  dirtyLevel:      z.nativeEnum(DirtyLevel),
  urgency:         z.nativeEnum(TaskUrgency).default('MEDIUM'),
  rateCents:       z.number().int().positive().optional(), // auto-calc if omitted
  locationLat:     z.number().min(-90).max(90).optional(),
  locationLng:     z.number().min(-180).max(180).optional(),
  locationAddress: z.string().max(500).optional(),
  zoneId:          z.string().min(1).optional(),
  workWindowStart: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  workWindowEnd:   z.string().regex(/^\d{2}:\d{2}$/).default('11:30'),
  uploadWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).default('12:00'),
  timezone:        z.string().default('Asia/Kolkata'),
})

// ─── Simple reason schemas ────────────────────────────────────────────────────
export const reasonSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
})

// ─── Location update ──────────────────────────────────────────────────────────
export const locationUpdateSchema = z.object({
  lat:      z.number().min(-90).max(90),
  lng:      z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
})

// ─── Query params ──────────────────────────────────────────────────────────────
// status accepts a single value OR comma-separated values
// e.g. status=ACCEPTED or status=ACCEPTED,IN_PROGRESS,SUBMITTED
export const listTasksQuerySchema = z.object({
  status: z.string().optional().transform((val) => {
    if (!val) return undefined
    const parts = val.split(',').map((s) => s.trim()).filter(Boolean)
    const valid = parts.filter((s) => Object.values(TaskStatus).includes(s as TaskStatus))
    return valid.length > 0 ? valid as TaskStatus[] : undefined
  }),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
})

export const openTasksQuerySchema = z.object({
  category: z.nativeEnum(TaskCategory).optional(),
  urgency:  z.nativeEnum(TaskUrgency).optional(),
  lat:      z.coerce.number().min(-90).max(90).optional(),
  lng:      z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(50).default(10),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
})

// ─── Path params ───────────────────────────────────────────────────────────────
export const taskIdParamSchema = z.object({
  taskId: z.string().min(1),
})

// ─── Start task (optional geofence body) ──────────────────────────────────────
// Uses z.preprocess so null/undefined body (no Content-Type) becomes {} rather
// than a Zod parse error — the geofence fields are genuinely optional.
export const startTaskSchema = z.preprocess(
  (val) => val ?? {},
  z.object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }),
)

// ─── Rating ────────────────────────────────────────────────────────────────────
export const rateTaskSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  tags:    z.array(z.string().max(50)).max(10).optional(),
})

// ─── Inferred types ────────────────────────────────────────────────────────────
export type CreateTaskInput     = z.infer<typeof createTaskSchema>
export type ReasonInput         = z.infer<typeof reasonSchema>
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>
export type StartTaskInput      = z.infer<typeof startTaskSchema>
export type ListTasksQuery      = z.infer<typeof listTasksQuerySchema>
export type OpenTasksQuery      = z.infer<typeof openTasksQuerySchema>
export type TaskIdParam         = z.infer<typeof taskIdParamSchema>
export type RateTaskInput       = z.infer<typeof rateTaskSchema>
