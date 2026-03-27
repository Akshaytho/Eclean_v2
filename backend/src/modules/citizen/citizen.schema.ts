import { z } from 'zod'
import { TaskCategory, TaskUrgency } from '@prisma/client'

// ─── Create report ────────────────────────────────────────────────────────────
export const createReportSchema = z.object({
  category:        z.nativeEnum(TaskCategory),
  description:     z.string().min(10).max(2000),
  urgency:         z.nativeEnum(TaskUrgency).default('MEDIUM'),
  lat:             z.number().min(-90).max(90).optional(),
  lng:             z.number().min(-180).max(180).optional(),
  locationAddress: z.string().max(500).optional(),
  photoUrl:        z.string().url().optional(),
})

// ─── Query params ─────────────────────────────────────────────────────────────
export const listReportsQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ─── Inferred types ───────────────────────────────────────────────────────────
export type CreateReportInput = z.infer<typeof createReportSchema>
export type ListReportsQuery  = z.infer<typeof listReportsQuerySchema>
