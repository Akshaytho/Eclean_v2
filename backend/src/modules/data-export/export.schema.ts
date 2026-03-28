// eClean — Data Export schemas
// Zod validation for B2B data export endpoints.
// These endpoints are authenticated via API keys, not JWT.

import { z } from 'zod'

export const zonesExportSchema = z.object({
  city:   z.string().optional(),
  from:   z.string().datetime().optional(),
  to:     z.string().datetime().optional(),
  days:   z.coerce.number().int().min(1).max(365).default(30),
  format: z.enum(['json', 'geojson']).default('json'),
})

export const wastePatternsSchema = z.object({
  city:   z.string().optional(),
  zoneId: z.string().optional(),
  from:   z.string().datetime().optional(),
  to:     z.string().datetime().optional(),
  days:   z.coerce.number().int().min(1).max(365).default(30),
})

export const cleanlinessIndexSchema = z.object({
  city:   z.string().optional(),
  zoneId: z.string().optional(),
  months: z.coerce.number().int().min(1).max(24).default(6),
})

export const drainRiskSchema = z.object({
  city:   z.string().optional(),
  season: z.enum(['monsoon', 'summer', 'winter', 'all']).default('all'),
})

export type ZonesExportQuery      = z.infer<typeof zonesExportSchema>
export type WastePatternsQuery    = z.infer<typeof wastePatternsSchema>
export type CleanlinessIndexQuery = z.infer<typeof cleanlinessIndexSchema>
export type DrainRiskQuery        = z.infer<typeof drainRiskSchema>
