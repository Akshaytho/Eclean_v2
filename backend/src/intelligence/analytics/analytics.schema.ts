// eClean — Analytics module schemas
// Zod validation for analytics-related endpoints.

import { z } from 'zod'

// ─── Behavior events (mobile sends batches) ───────────────────────────────────

const behaviorEventSchema = z.object({
  eventType:  z.string().min(1).max(100),
  entityType: z.string().max(50).optional(),
  entityId:   z.string().max(100).optional(),
  payload:    z.record(z.unknown()).optional(),
  sessionId:  z.string().max(100).optional(),
  // Allow mobile to send a timestamp (for events queued offline)
  // — falls back to server time if not provided
  timestamp:  z.string().datetime().optional(),
})

export const behaviorEventBatchSchema = z.object({
  events: z.array(behaviorEventSchema).min(1).max(100),
})

export type BehaviorEventInput    = z.infer<typeof behaviorEventSchema>
export type BehaviorEventBatchInput = z.infer<typeof behaviorEventBatchSchema>

// ─── Analytics query params (for Phase 4 endpoints) ───────────────────────────

export const dateRangeQuerySchema = z.object({
  from:  z.string().datetime().optional(),
  to:    z.string().datetime().optional(),
  days:  z.coerce.number().int().min(1).max(365).default(30),
})

export const zoneIdParamSchema = z.object({
  id: z.string().min(1),
})

export const leaderboardQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('week'),
  limit:  z.coerce.number().int().min(1).max(50).default(10),
})

export const cityQuerySchema = z.object({
  city:  z.string().min(1).optional(),
  from:  z.string().datetime().optional(),
  to:    z.string().datetime().optional(),
})

export type DateRangeQuery    = z.infer<typeof dateRangeQuerySchema>
export type LeaderboardQuery  = z.infer<typeof leaderboardQuerySchema>
export type CityQuery         = z.infer<typeof cityQuerySchema>
