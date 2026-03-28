/**
 * CI Seed Endpoint — /api/v1/ci/seed
 *
 * Creates test accounts idempotently for Maestro E2E tests.
 * Protected by CI_SECRET header — never callable without the secret.
 * Only runs when CI_SECRET env var is set (not in production without it).
 *
 * POST /api/v1/ci/seed
 * Header: x-ci-secret: <CI_SECRET>
 * Response: { worker: { email, token }, buyer: { email, token } }
 */

import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcrypt'
import { prisma } from '../../lib/prisma'
import { env } from '../../config/env'
import { signAccessToken } from '../../lib/jwt'

const CI_WORKER_EMAIL = 'maestro-worker@eclean.test'
const CI_BUYER_EMAIL  = 'maestro-buyer@eclean.test'
const CI_PASSWORD     = 'Test@1234'

export async function ciRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/seed', async (request, reply) => {
    const ciSecret = env.CI_SECRET
    if (!ciSecret) {
      return reply.status(404).send({ error: 'Not found' })
    }

    const providedSecret = request.headers['x-ci-secret']
    if (providedSecret !== ciSecret) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const passwordHash = await bcrypt.hash(CI_PASSWORD, 10)

    const worker = await prisma.user.upsert({
      where:  { email: CI_WORKER_EMAIL },
      update: { passwordHash, isEmailVerified: true, name: 'CI Worker' },
      create: {
        email:           CI_WORKER_EMAIL,
        passwordHash,
        name:            'CI Worker',
        role:            'WORKER',
        isEmailVerified: true,
        workerProfile:   { create: { skills: [] } },
      },
    })

    const buyer = await prisma.user.upsert({
      where:  { email: CI_BUYER_EMAIL },
      update: { passwordHash, isEmailVerified: true, name: 'CI Buyer' },
      create: {
        email:           CI_BUYER_EMAIL,
        passwordHash,
        name:            'CI Buyer',
        role:            'BUYER',
        isEmailVerified: true,
      },
    })

    const { token: workerToken } = signAccessToken(worker.id, worker.role, worker.email)
    const { token: buyerToken }  = signAccessToken(buyer.id, buyer.role, buyer.email)

    return reply.status(200).send({
      ok: true,
      worker: { email: CI_WORKER_EMAIL, id: worker.id, token: workerToken },
      buyer:  { email: CI_BUYER_EMAIL,  id: buyer.id,  token: buyerToken },
    })
  })
}
