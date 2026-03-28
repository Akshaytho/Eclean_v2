import { z } from 'zod'
import { DirtyLevel, Role, TaskUrgency } from '@prisma/client'

// ─── Convert report → task ────────────────────────────────────────────────────
export const convertToTaskSchema = z.object({
  buyerId:    z.string().uuid().optional(),
  title:      z.string().min(3).max(200).optional(),
  rateCents:  z.number().int().positive().optional(),
  dirtyLevel: z.nativeEnum(DirtyLevel).optional(),
  urgency:    z.nativeEnum(TaskUrgency).optional(),
})

// ─── Resolve dispute ──────────────────────────────────────────────────────────
export const resolveDisputeSchema = z.object({
  decision:   z.enum(['APPROVE', 'REJECT']),
  adminNotes: z.string().min(10, 'Admin notes must be at least 10 characters').max(1000),
})

// ─── List users ───────────────────────────────────────────────────────────────
export const listUsersQuerySchema = z.object({
  role:  z.nativeEnum(Role).optional(),
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ─── List disputes ────────────────────────────────────────────────────────────
export const listDisputesQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ─── Path params ──────────────────────────────────────────────────────────────
export const reportIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const taskIdParamSchema = z.object({
  taskId: z.string().min(1),
})

// ─── API Key management ───────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name:             z.string().min(2).max(100),
  organizationName: z.string().min(2).max(200),
  contactEmail:     z.string().email().optional(),
  permissions:      z.array(z.string().min(1).max(50)).min(1),
  rateLimitTier:    z.enum(['standard', 'premium', 'unlimited']).default('standard'),
  expiresInDays:    z.number().int().positive().max(365).optional(),
})

export const apiKeyIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const listApiKeysQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ─── Inferred types ───────────────────────────────────────────────────────────
export type ConvertToTaskInput  = z.infer<typeof convertToTaskSchema>
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>
export type ListUsersQuery      = z.infer<typeof listUsersQuerySchema>
export type ListDisputesQuery   = z.infer<typeof listDisputesQuerySchema>
export type CreateApiKeyInput   = z.infer<typeof createApiKeySchema>
export type ListApiKeysQuery    = z.infer<typeof listApiKeysQuerySchema>
