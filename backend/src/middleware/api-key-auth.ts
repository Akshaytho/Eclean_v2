// eClean — API Key authentication middleware
//
// Used by the data-export module for B2B customers (municipalities, etc.)
// Completely independent from JWT auth — separate auth path.
// Keys are stored as SHA-256 hashes (same security pattern as passwords).
//
// Usage in routes:
//   fastify.get('/data/zones', { preHandler: [apiKeyAuth(['zones'])] }, handler)
//
// Client sends: x-api-key: eCl_abc123...full_key...
// Middleware: SHA-256 hash → lookup in ApiKey table → check permissions + active + expiry

import crypto from 'crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { UnauthorizedError, ForbiddenError } from '../lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

// Attach API key info to request for downstream use (export logging)
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: {
      id: string
      organizationName: string
      permissions: string[]
      rateLimitTier: string
    }
  }
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Returns a preHandler that authenticates via x-api-key header.
 * @param requiredPermissions - which data endpoints this key must have access to.
 *   e.g. ['zones', 'waste_patterns']. Empty array = any valid key is accepted.
 */
export function apiKeyAuth(requiredPermissions: string[] = []) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const rawKey = request.headers['x-api-key'] as string | undefined

    if (!rawKey) {
      throw new UnauthorizedError('Missing x-api-key header')
    }

    // Hash the key to look up in DB
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
    })

    if (!apiKey) {
      throw new UnauthorizedError('Invalid API key')
    }

    if (!apiKey.isActive) {
      throw new UnauthorizedError('API key has been deactivated')
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedError('API key has expired')
    }

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every(p => apiKey.permissions.includes(p))
      if (!hasAll) {
        throw new ForbiddenError(
          `API key does not have permission for: ${requiredPermissions.filter(p => !apiKey.permissions.includes(p)).join(', ')}`,
        )
      }
    }

    // Attach to request for downstream logging
    request.apiKey = {
      id: apiKey.id,
      organizationName: apiKey.organizationName,
      permissions: apiKey.permissions,
      rateLimitTier: apiKey.rateLimitTier,
    }

    // Update lastUsedAt (fire-and-forget — don't block the request)
    void prisma.apiKey.update({
      where: { id: apiKey.id },
      data:  { lastUsedAt: new Date() },
    }).catch((err) => {
      logger.error({ err, apiKeyId: apiKey.id }, 'Failed to update API key lastUsedAt')
    })
  }
}

// ─── Key generation utility ───────────────────────────────────────────────────
// Used by admin routes to create new API keys.

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = `eCl_${crypto.randomBytes(32).toString('base64url')}`
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 12)
  return { rawKey, keyHash, keyPrefix }
}
