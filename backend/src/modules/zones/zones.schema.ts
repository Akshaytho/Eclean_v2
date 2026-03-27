import { z } from 'zod'
import { DirtyLevel } from '@prisma/client'

// ─── Create zone ──────────────────────────────────────────────────────────────
export const createZoneSchema = z.object({
  name:         z.string().min(2).max(100),
  city:         z.string().min(2).max(100),
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  radiusMeters: z.number().int().positive().max(50000),
})

// ─── Inspect zone ─────────────────────────────────────────────────────────────
export const inspectZoneSchema = z.object({
  dirtyLevel: z.nativeEnum(DirtyLevel),
  note:       z.string().max(500).optional(),
})

// ─── Query / params ───────────────────────────────────────────────────────────
export const listZonesQuerySchema = z.object({
  city: z.string().optional(),
})

export const zoneIdParamSchema = z.object({
  id: z.string().uuid(),
})

// ─── Inferred types ───────────────────────────────────────────────────────────
export type CreateZoneInput  = z.infer<typeof createZoneSchema>
export type InspectZoneInput = z.infer<typeof inspectZoneSchema>
export type ListZonesQuery   = z.infer<typeof listZonesQuerySchema>
