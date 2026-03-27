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

// ─── Inferred types ───────────────────────────────────────────────────────────
export type ConvertToTaskInput  = z.infer<typeof convertToTaskSchema>
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>
export type ListUsersQuery      = z.infer<typeof listUsersQuerySchema>
export type ListDisputesQuery   = z.infer<typeof listDisputesQuerySchema>
