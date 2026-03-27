import { z } from 'zod'

export const deviceTokenBodySchema = z.object({
  token: z.string().min(1).max(4096),
})

export const notifListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
})

export const notifIdParamSchema = z.object({
  id: z.string().uuid(),
})

export type DeviceTokenBody = z.infer<typeof deviceTokenBodySchema>
export type NotifListQuery  = z.infer<typeof notifListQuerySchema>
export type NotifIdParam    = z.infer<typeof notifIdParamSchema>
