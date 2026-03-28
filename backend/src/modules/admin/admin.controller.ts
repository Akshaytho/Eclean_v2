import type { FastifyRequest, FastifyReply } from 'fastify'
import type {
  ConvertToTaskInput,
  ResolveDisputeInput,
  ListUsersQuery,
  ListDisputesQuery,
  CreateApiKeyInput,
  ListApiKeysQuery,
} from './admin.schema'
import * as svc from './admin.service'
import { prisma } from '../../lib/prisma'
import { generateApiKey } from '../../middleware/api-key-auth'

export async function convertReportToTask(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const task = await svc.convertReportToTask(id, req.user.id, req.body as ConvertToTaskInput)
  await reply.code(201).send(task)
}

export async function getAdminDashboard(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const stats = await svc.getAdminDashboard()
  await reply.send(stats)
}

export async function listDisputes(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.listDisputes(req.query as ListDisputesQuery)
  await reply.send(result)
}

export async function resolveDispute(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { taskId } = req.params as { taskId: string }
  const result = await svc.resolveDispute(taskId, req.user.id, req.body as ResolveDisputeInput)
  await reply.send(result)
}

export async function listPayouts(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = req.query as { page?: number; limit?: number }
  const page  = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)))
  const skip  = (page - 1) * limit

  const [payouts, total] = await Promise.all([
    prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        task:   { select: { title: true } },
        worker: { select: { name: true } },
        buyer:  { select: { name: true } },
      },
    }),
    prisma.payout.count(),
  ])

  const items = payouts.map((p) => ({
    id:               p.id,
    taskId:           p.taskId,
    taskTitle:        p.task.title,
    workerName:       p.worker.name,
    buyerName:        p.buyer.name,
    amountCents:      p.amountCents,
    workerAmountCents: p.workerAmountCents,
    platformFeeCents: p.platformFeeCents,
    status:           p.status,
    paidAt:           p.paidAt,
    createdAt:        p.createdAt,
  }))

  await reply.send({ payouts: items, total, page, limit })
}

export async function listUsers(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const result = await svc.listUsers(req.query as ListUsersQuery)
  await reply.send(result)
}

export async function deactivateUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const result = await svc.deactivateUser(id)
  await reply.send(result)
}

export async function activateUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const result = await svc.activateUser(id)
  await reply.send(result)
}

export async function verifyUserIdentity(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }
  const result = await svc.verifyUserIdentity(id)
  await reply.send(result)
}

// ─── API KEY MANAGEMENT ───────────────────────────────────────────────────────

export async function createApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = req.body as CreateApiKeyInput
  const { rawKey, keyHash, keyPrefix } = generateApiKey()

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash,
      keyPrefix,
      name:             input.name,
      organizationName: input.organizationName,
      contactEmail:     input.contactEmail ?? null,
      permissions:      input.permissions,
      rateLimitTier:    input.rateLimitTier,
      isActive:         true,
      createdById:      req.user.id,
      expiresAt,
    },
  })

  // rawKey is shown ONCE — never stored, never recoverable
  await reply.status(201).send({
    apiKey: {
      id:               apiKey.id,
      rawKey,                        // ← ONLY TIME this is ever visible
      keyPrefix:        apiKey.keyPrefix,
      name:             apiKey.name,
      organizationName: apiKey.organizationName,
      permissions:      apiKey.permissions,
      rateLimitTier:    apiKey.rateLimitTier,
      expiresAt:        apiKey.expiresAt,
      createdAt:        apiKey.createdAt,
    },
    warning: 'Save this key now. It cannot be retrieved again.',
  })
}

export async function listApiKeys(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = req.query as ListApiKeysQuery
  const skip = (query.page - 1) * query.limit

  const [keys, total] = await Promise.all([
    prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      select: {
        id: true, keyPrefix: true, name: true, organizationName: true,
        contactEmail: true, permissions: true, rateLimitTier: true,
        isActive: true, expiresAt: true, lastUsedAt: true, createdAt: true,
        // keyHash is NEVER returned
      },
    }),
    prisma.apiKey.count(),
  ])

  await reply.send({ apiKeys: keys, total, page: query.page, limit: query.limit })
}

export async function revokeApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = req.params as { id: string }

  const key = await prisma.apiKey.findUnique({ where: { id } })
  if (!key) {
    await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API key not found' } })
    return
  }

  await prisma.apiKey.update({
    where: { id },
    data:  { isActive: false },
  })

  await reply.send({ id, revoked: true })
}
