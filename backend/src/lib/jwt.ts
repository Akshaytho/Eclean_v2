import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'
import { UnauthorizedError } from './errors'

export interface TokenPayload {
  sub: string   // user id
  role: Role
  email: string
  jti: string   // unique token id — used for blacklisting
  type: 'access' | 'refresh'
  iat: number
  exp: number
}

// Expiry constants in seconds (also used to set Redis TTLs)
export const ACCESS_TTL_SECS = 15 * 60            // 15 minutes
export const REFRESH_TTL_SECS = 7 * 24 * 60 * 60  // 7 days

export function signAccessToken(
  sub: string,
  role: Role,
  email: string,
): { token: string; jti: string } {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { sub, role, email, jti, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL_SECS },
  )
  return { token, jti }
}

export function signRefreshToken(
  sub: string,
  role: Role,
  email: string,
): { token: string; jti: string } {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { sub, role, email, jti, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL_SECS },
  )
  return { token, jti }
}

export function verifyToken(token: string, type: 'access' | 'refresh'): TokenPayload {
  const secret = type === 'access' ? env.JWT_ACCESS_SECRET : env.JWT_REFRESH_SECRET
  try {
    const payload = jwt.verify(token, secret) as TokenPayload
    if (payload.type !== type) {
      throw new UnauthorizedError(`Expected ${type} token`)
    }
    return payload
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired token')
  }
}
