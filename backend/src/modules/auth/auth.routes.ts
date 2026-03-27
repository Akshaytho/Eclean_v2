import type { FastifyInstance } from 'fastify'
import * as authService from './auth.service'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import { env } from '../../config/env'
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type RegisterInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from './auth.schema'
import { UnauthorizedError } from '../../lib/errors'

// Shared cookie options for refreshToken
const REFRESH_COOKIE_OPTS = {
  httpOnly:  true,
  secure:    env.NODE_ENV === 'production',
  sameSite:  'strict' as const,
  path:      '/',
  maxAge:    7 * 24 * 60 * 60, // 7 days (matches refresh token lifetime)
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/register
  fastify.post<{ Body: RegisterInput }>(
    '/register',
    {
      config: { rateLimit: { max: env.NODE_ENV === 'production' ? 5 : 10000, timeWindow: '1 hour' } },
      preHandler: [validate({ body: registerSchema })],
    },
    async (request, reply) => {
      const result = await authService.register(request.body)
      reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS)
      return reply.status(201).send({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken })
    },
  )

  // POST /api/v1/auth/login
  fastify.post<{ Body: LoginInput }>(
    '/login',
    {
      config: { rateLimit: { max: env.NODE_ENV === 'production' ? 10 : 10000, timeWindow: '1 minute' } },
      preHandler: [validate({ body: loginSchema })],
    },
    async (request, reply) => {
      const result = await authService.login(request.body)
      reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS)
      return reply.status(200).send({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken })
    },
  )

  // POST /api/v1/auth/refresh
  // Accepts refreshToken from httpOnly cookie OR request body (body takes priority for backwards compatibility)
  fastify.post(
    '/refresh',
    { preHandler: [validate({ body: refreshSchema })] },
    async (request, reply) => {
      const body = request.body as { refreshToken?: string }
      const tokenFromCookie = request.cookies?.refreshToken
      const token = body.refreshToken ?? tokenFromCookie

      if (!token) throw new UnauthorizedError('No refresh token provided')

      const result = await authService.refresh(token)
      reply.setCookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTS)
      return reply.status(200).send({ accessToken: result.accessToken, refreshToken: result.refreshToken })
    },
  )

  // POST /api/v1/auth/logout
  fastify.post(
    '/logout',
    { preHandler: [validate({ body: logoutSchema })] },
    async (request, reply) => {
      const body = request.body as { refreshToken?: string; accessToken?: string }
      const tokenFromCookie = request.cookies?.refreshToken
      const logoutInput: { refreshToken?: string; accessToken?: string } = {}
      const rt = body.refreshToken ?? tokenFromCookie
      if (rt) logoutInput.refreshToken = rt
      if (body.accessToken) logoutInput.accessToken = body.accessToken
      await authService.logout(logoutInput)
      // Clear the httpOnly cookie
      reply.clearCookie('refreshToken', { path: '/' })
      return reply.status(200).send({ success: true })
    },
  )

  // GET /api/v1/auth/me  (requires authentication)
  fastify.get(
    '/me',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = await authService.getMe(request.user.id)
      return reply.status(200).send({ user })
    },
  )

  // POST /api/v1/auth/forgot-password
  fastify.post<{ Body: ForgotPasswordInput }>(
    '/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      preHandler: [validate({ body: forgotPasswordSchema })],
    },
    async (request, reply) => {
      await authService.forgotPassword(request.body)
      // Always 200 — never reveal if email is registered
      return reply.status(200).send({
        message: 'If that email is registered, a reset link has been sent',
      })
    },
  )

  // POST /api/v1/auth/reset-password
  fastify.post<{ Body: ResetPasswordInput }>(
    '/reset-password',
    { preHandler: [validate({ body: resetPasswordSchema })] },
    async (request, reply) => {
      await authService.resetPassword(request.body)
      return reply.status(200).send({ message: 'Password updated successfully' })
    },
  )

  // POST /api/v1/auth/verify-email
  fastify.post<{ Body: VerifyEmailInput }>(
    '/verify-email',
    { preHandler: [validate({ body: verifyEmailSchema })] },
    async (request, reply) => {
      await authService.verifyEmail(request.body)
      return reply.status(200).send({ message: 'Email verified successfully' })
    },
  )
}
