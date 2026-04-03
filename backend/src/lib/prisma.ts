import { PrismaClient } from '@prisma/client'

// Singleton pattern — prevents multiple connections in development hot-reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

// PERF: Pool sizing for 500 concurrent workers:
// - Serializable txs (start, submit, cancel): hold connections 50-200ms each
// - GPS writes via socket: cached in Redis (30s TTL), ~1 DB write per 5s per worker
// - Read queries (open tasks, my tasks, wallet): fast with indexes
// Railway PostgreSQL supports ~100 connections via proxy; pool = 30 handles burst load.
// pool_timeout=15 gives more room for serializable retry queuing.
const dbUrl = process.env.DATABASE_URL ?? ''
const pooledUrl = dbUrl.includes('connection_limit')
  ? dbUrl
  : `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}connection_limit=30&pool_timeout=15`

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: pooledUrl } },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
