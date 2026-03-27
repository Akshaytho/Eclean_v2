import crypto from 'crypto'
import bcrypt from 'bcrypt'
import type { Role, User } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { env } from '../../config/env'
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../../lib/jwt'
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from '../../lib/errors'
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email'
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './auth.schema'

// ─── Types ────────────────────────────────────────────────────────────────────

type SafeUser = Omit<User, 'passwordHash' | 'emailVerifyToken'>

export interface AuthResult {
  user: SafeUser
  accessToken: string
  refreshToken: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, emailVerifyToken: _et, ...safe } = user
  return safe
}

// Lazy singleton — computed once on first failed login to prevent timing attacks
let _dummyHash: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (_dummyHash === null) {
    _dummyHash = bcrypt.hash('timing-safe-dummy-eclean', 12)
  }
  return _dummyHash
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw new ConflictError('An account with this email already exists')
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS)
  const role = input.role as Role

  // Generate email verification token (raw sent in email, SHA-256 hash stored in DB)
  const rawVerifyToken    = crypto.randomBytes(32).toString('hex')
  const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex')

  // Atomic: create User + role-specific profile in one transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { email: input.email, name: input.name, role, passwordHash, emailVerifyToken: hashedVerifyToken },
    })

    if (role === 'WORKER') {
      await tx.workerProfile.create({ data: { userId: newUser.id } })
    } else if (role === 'BUYER') {
      await tx.buyerProfile.create({ data: { userId: newUser.id } })
    }

    return newUser
  })

  const { token: accessToken } = signAccessToken(user.id, user.role, user.email)
  const { token: refreshToken } = signRefreshToken(user.id, user.role, user.email)

  // Fire-and-forget — email failure must not block registration
  void sendVerificationEmail(user.email, rawVerifyToken)

  return { user: sanitizeUser(user), accessToken, refreshToken }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })

  // Always run bcrypt to prevent user-enumeration via timing differences
  const hashToCheck = user !== null ? user.passwordHash : await getDummyHash()
  const isValid = await bcrypt.compare(input.password, hashToCheck)

  if (user === null || !isValid) {
    throw new UnauthorizedError('Invalid email or password')
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account has been deactivated')
  }

  const { token: accessToken } = signAccessToken(user.id, user.role, user.email)
  const { token: refreshToken } = signRefreshToken(user.id, user.role, user.email)

  return { user: sanitizeUser(user), accessToken, refreshToken }
}

export async function refresh(refreshToken: string): Promise<Omit<AuthResult, 'user'>> {
  const payload = verifyToken(refreshToken, 'refresh')

  // Reject if already blacklisted (replay attack protection)
  const isBlacklisted = await redis.exists(`blacklist:${payload.jti}`)
  if (isBlacklisted) {
    throw new UnauthorizedError('Refresh token has been revoked')
  }

  // Blacklist old refresh JTI for the remainder of its lifetime
  const remainingTTL = payload.exp - Math.floor(Date.now() / 1000)
  if (remainingTTL > 0) {
    await redis.setex(`blacklist:${payload.jti}`, remainingTTL, '1')
  }

  // Verify user still exists and is active
  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (user === null || !user.isActive) {
    throw new UnauthorizedError('User not found or deactivated')
  }

  const { token: accessToken }  = signAccessToken(user.id, user.role, user.email)
  const { token: newRefreshToken } = signRefreshToken(user.id, user.role, user.email)

  return { accessToken, refreshToken: newRefreshToken }
}

export async function logout(input: { refreshToken?: string; accessToken?: string }): Promise<void> {
  if (input.refreshToken) {
    try {
      const r = verifyToken(input.refreshToken, 'refresh')
      const ttlR = r.exp - Math.floor(Date.now() / 1000)
      if (ttlR > 0) await redis.setex(`blacklist:${r.jti}`, ttlR, '1')
    } catch {}
  }

  if (input.accessToken) {
    try {
      const a = verifyToken(input.accessToken, 'access')
      const ttlA = a.exp - Math.floor(Date.now() / 1000)
      if (ttlA > 0) await redis.setex(`blacklist:${a.jti}`, ttlA, '1')
    } catch {}
  }
}

export async function getMe(userId: string): Promise<
  SafeUser & {
    workerProfile: { id: string; rating: number; completedTasks: number; isAvailable: boolean; identityVerified: boolean; skills: string[] } | null
    buyerProfile: { id: string; companyName: string | null; totalTasksPosted: number; totalSpentCents: number } | null
  }
> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { workerProfile: true, buyerProfile: true },
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, emailVerifyToken: _et, ...safe } = user
  return safe
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })

  // Always return success — never reveal whether the email is registered
  if (user === null) return

  const rawToken = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

  // Store in Redis with 1-hour TTL; key deleted on use
  await redis.setex(`pwreset:${hashedToken}`, 3600, user.id)

  void sendPasswordResetEmail(user.email, rawToken)
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex')

  const userId = await redis.get(`pwreset:${hashedToken}`)
  if (userId === null) {
    throw new BadRequestError('Reset token is invalid or has expired')
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS)

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  // Consume the token — single-use
  await redis.del(`pwreset:${hashedToken}`)
}

export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex')
  const user = await prisma.user.findUnique({ where: { emailVerifyToken: hashedToken } })
  if (!user) throw new BadRequestError('Invalid or expired verification token')
  await prisma.user.update({
    where: { id: user.id },
    data:  { isEmailVerified: true, emailVerifyToken: null },
  })
}

// Graceful shutdown helpers — used in main.ts
export async function disconnectAll(): Promise<void> {
  await prisma.$disconnect()
  redis.disconnect()
}

