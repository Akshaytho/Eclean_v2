import { PrismaClient } from '@prisma/client'

// Singleton pattern — prevents multiple connections in development hot-reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

// PERF: default pool is 5 connections — far too low for production.
// 50 concurrent serializable transactions + GPS writes + API queries exhaust it instantly.
// Railway PostgreSQL supports 25+ connections; set pool to 20 with 10s timeout.
const dbUrl = process.env.DATABASE_URL ?? ''
const pooledUrl = dbUrl.includes('connection_limit')
  ? dbUrl
  : `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}connection_limit=20&pool_timeout=10`

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: pooledUrl } },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
