import { z } from 'zod'

// ─── Flag task ────────────────────────────────────────────────────────────────
export const flagTaskSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
})

// ─── Supervisor tasks query ───────────────────────────────────────────────────
export const supervisorTasksQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
})

// ─── Path params ──────────────────────────────────────────────────────────────
export const taskIdParamSchema = z.object({
  id: z.string().min(1),
})

// ─── Inferred types ───────────────────────────────────────────────────────────
export type FlagTaskInput             = z.infer<typeof flagTaskSchema>
export type SupervisorTasksQuery      = z.infer<typeof supervisorTasksQuerySchema>
