import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@prisma/client'
import { verifyToken } from '../lib/jwt'
import { redis } from '../lib/redis'
import { UnauthorizedError } from '../lib/errors'

// Extend FastifyRequest with an authenticated user attachment
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string
      role: Role
      email: string
      jti: string
    }
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }

  const token = authHeader.slice(7)
  const payload = verifyToken(token, 'access')

  // Check JTI blacklist (tokens revoked on logout or refresh rotation)
  const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`)
  if (isBlacklisted) {
    throw new UnauthorizedError('Token has been revoked')
  }

  request.user = {
    id: payload.sub,
    role: payload.role,
    email: payload.email,
    jti: payload.jti,
  }
}
