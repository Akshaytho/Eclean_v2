import { z } from 'zod'

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordRule,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  // Only self-service roles — SUPERVISOR and ADMIN are assigned by admins
  role: z.enum(['BUYER', 'WORKER', 'CITIZEN']),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

// refreshToken is optional in body — backend reads from httpOnly cookie if absent
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  accessToken:  z.string().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordRule,
})

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

export type RegisterInput      = z.infer<typeof registerSchema>
export type LoginInput         = z.infer<typeof loginSchema>
export type RefreshInput       = z.infer<typeof refreshSchema>
export type LogoutInput        = z.infer<typeof logoutSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type VerifyEmailInput   = z.infer<typeof verifyEmailSchema>
