import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env'
import { errorHandler } from './middleware/error-handler'
import { authRoutes } from './modules/auth/auth.routes'
import { ciRoutes } from './modules/ci/ci.routes'
import { buyerRoutes } from './modules/tasks/buyer.routes'
import { workerRoutes } from './modules/tasks/worker.routes'
import { mediaRoutes } from './modules/media/media.routes'
import { zoneRoutes } from './modules/zones/zones.routes'
import { supervisorRoutes } from './modules/supervisor/supervisor.routes'
import { citizenRoutes } from './modules/citizen/citizen.routes'
import { adminRoutes } from './modules/admin/admin.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { payoutsRoutes } from './modules/payouts/payouts.routes'
import { analyticsRoutes } from './intelligence/analytics/analytics.routes'
import { dataExportRoutes } from './intelligence/data-export/export.routes'
import type { FastifyInstance } from 'fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test'
      ? false
      : env.NODE_ENV !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
          }
        : true,
  })

  // ── Plugins ──────────────────────────────────────────────────────────────────
  void app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true) // server-to-server / curl
      const allowed = env.CORS_ORIGINS.split(',').map(s => s.trim())
      const isAllowed = allowed.includes(origin)
        || /^https?:\/\/localhost(:\d+)?$/.test(origin)
        || /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin)
      cb(null, isAllowed)
    },
    credentials: true,
  })
  void app.register(helmet, { contentSecurityPolicy: false })
  void app.register(cookie)
  void app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  })
  void app.register(rateLimit, {
    global: false,
  })

  // Allow empty body for application/json
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (body as string).length === 0) { done(null, {}); return }
    try { done(null, JSON.parse(body as string)) } catch (err) { done(err as Error, undefined) }
  })

  // ── Error handler ────────────────────────────────────────────────────────────
  app.setErrorHandler(errorHandler)

  // ── Routes ───────────────────────────────────────────────────────────────────
  void app.register(authRoutes,          { prefix: '/api/v1/auth' })
  void app.register(ciRoutes,            { prefix: '/api/v1/ci' })   // CI-only — protected by CI_SECRET header
  void app.register(buyerRoutes,         { prefix: '/api/v1/buyer/tasks' })
  void app.register(workerRoutes,        { prefix: '/api/v1/worker' })
  void app.register(mediaRoutes,         { prefix: '/api/v1/tasks' })
  void app.register(zoneRoutes,          { prefix: '/api/v1/zones' })
  void app.register(supervisorRoutes,    { prefix: '/api/v1/supervisor' })
  void app.register(citizenRoutes,       { prefix: '/api/v1/citizen' })
  void app.register(adminRoutes,         { prefix: '/api/v1/admin' })
  void app.register(notificationsRoutes, { prefix: '/api/v1/notifications' })
  void app.register(payoutsRoutes,       { prefix: '/api/v1' })
  void app.register(analyticsRoutes,     { prefix: '/api/v1/analytics' }) // analytics + behavior events
  void app.register(dataExportRoutes,    { prefix: '/api/v1/data' })      // B2B data export (API key auth)

  app.get('/health', async () => ({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  }))

  // TEMPORARY — one-time migration endpoint. DELETE after analytics tables are created.
  app.post('/run-migration', async (_req, reply) => {
    const results: string[] = []
    const tables = [
      `CREATE TABLE IF NOT EXISTS "analytics_event_log" ("id" TEXT NOT NULL,"entity" TEXT NOT NULL,"entityId" TEXT NOT NULL,"action" TEXT NOT NULL,"actorId" TEXT,"actorRole" TEXT,"payload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_event_log_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_zone_snapshot" ("id" TEXT NOT NULL,"zoneId" TEXT NOT NULL,"zoneName" TEXT NOT NULL,"city" TEXT,"date" TIMESTAMP(3) NOT NULL,"dirtyScore" INTEGER NOT NULL DEFAULT 0,"tasksCreated" INTEGER NOT NULL DEFAULT 0,"tasksCompleted" INTEGER NOT NULL DEFAULT 0,"tasksCancelled" INTEGER NOT NULL DEFAULT 0,"avgAiScore" DOUBLE PRECISION,"aiRejectionRate" DOUBLE PRECISION,"citizenReportCount" INTEGER NOT NULL DEFAULT 0,"avgCompletionTimeSecs" INTEGER,"activeWorkerCount" INTEGER NOT NULL DEFAULT 0,"openTaskCountSnapshot" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_zone_snapshot_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_platform_metrics" ("id" TEXT NOT NULL,"date" TIMESTAMP(3) NOT NULL,"tasksCreated" INTEGER NOT NULL DEFAULT 0,"tasksCompleted" INTEGER NOT NULL DEFAULT 0,"tasksCancelled" INTEGER NOT NULL DEFAULT 0,"tasksDisputed" INTEGER NOT NULL DEFAULT 0,"totalRevenueCents" INTEGER NOT NULL DEFAULT 0,"platformFeeCents" INTEGER NOT NULL DEFAULT 0,"totalPayoutCents" INTEGER NOT NULL DEFAULT 0,"activeWorkers" INTEGER NOT NULL DEFAULT 0,"activeBuyers" INTEGER NOT NULL DEFAULT 0,"newSignups" INTEGER NOT NULL DEFAULT 0,"newSignupsByRole" JSONB,"avgTaskCompletionSecs" INTEGER,"avgAiScore" DOUBLE PRECISION,"citizenReportsTotal" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_platform_metrics_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_waste_pattern" ("id" TEXT NOT NULL,"zoneId" TEXT NOT NULL,"date" TIMESTAMP(3) NOT NULL,"hourOfDay" INTEGER NOT NULL,"dayOfWeek" INTEGER NOT NULL,"reportCount" INTEGER NOT NULL DEFAULT 0,"taskCount" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_waste_pattern_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_worker_daily" ("id" TEXT NOT NULL,"workerId" TEXT NOT NULL,"workerName" TEXT NOT NULL,"date" TIMESTAMP(3) NOT NULL,"tasksAccepted" INTEGER NOT NULL DEFAULT 0,"tasksCompleted" INTEGER NOT NULL DEFAULT 0,"tasksCancelled" INTEGER NOT NULL DEFAULT 0,"avgTimeSecs" INTEGER,"avgAiScore" DOUBLE PRECISION,"totalDistanceMeters" DOUBLE PRECISION,"earningsCents" INTEGER NOT NULL DEFAULT 0,"zonesWorked" TEXT[],"categoriesWorked" TEXT[],"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_worker_daily_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_photo_meta" ("id" TEXT NOT NULL,"mediaId" TEXT NOT NULL,"taskId" TEXT NOT NULL,"uploaderId" TEXT NOT NULL,"uploaderRole" TEXT NOT NULL,"mediaType" TEXT NOT NULL,"exifLat" DOUBLE PRECISION,"exifLng" DOUBLE PRECISION,"exifTimestamp" TIMESTAMP(3),"exifAltitude" DOUBLE PRECISION,"deviceMake" TEXT,"deviceModel" TEXT,"imageWidth" INTEGER,"imageHeight" INTEGER,"taskLat" DOUBLE PRECISION,"taskLng" DOUBLE PRECISION,"distanceFromTaskMeters" DOUBLE PRECISION,"isFlagged" BOOLEAN NOT NULL DEFAULT false,"flagReason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_photo_meta_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_behavior_event" ("id" TEXT NOT NULL,"userId" TEXT,"userRole" TEXT,"eventType" TEXT NOT NULL,"entityType" TEXT,"entityId" TEXT,"payload" JSONB,"sessionId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_behavior_event_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_data_export_log" ("id" TEXT NOT NULL,"apiKeyId" TEXT NOT NULL,"organizationName" TEXT NOT NULL,"endpoint" TEXT NOT NULL,"params" JSONB,"rowCount" INTEGER NOT NULL,"ipAddress" TEXT,"responseTimeMs" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_data_export_log_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "analytics_api_key" ("id" TEXT NOT NULL,"keyHash" TEXT NOT NULL,"keyPrefix" TEXT NOT NULL,"name" TEXT NOT NULL,"organizationName" TEXT NOT NULL,"contactEmail" TEXT,"permissions" TEXT[],"rateLimitTier" TEXT NOT NULL DEFAULT 'standard',"isActive" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT NOT NULL,"lastUsedAt" TIMESTAMP(3),"expiresAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "analytics_api_key_pkey" PRIMARY KEY ("id"))`,
    ]
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "analytics_event_log_entity_entityId_idx" ON "analytics_event_log"("entity","entityId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_event_log_createdAt_idx" ON "analytics_event_log"("createdAt")`,
      `CREATE INDEX IF NOT EXISTS "analytics_event_log_actorId_idx" ON "analytics_event_log"("actorId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_event_log_entity_action_idx" ON "analytics_event_log"("entity","action")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_zone_snapshot_zoneId_date_key" ON "analytics_zone_snapshot"("zoneId","date")`,
      `CREATE INDEX IF NOT EXISTS "analytics_zone_snapshot_date_idx" ON "analytics_zone_snapshot"("date")`,
      `CREATE INDEX IF NOT EXISTS "analytics_zone_snapshot_dirtyScore_idx" ON "analytics_zone_snapshot"("dirtyScore")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_platform_metrics_date_key" ON "analytics_platform_metrics"("date")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_waste_pattern_zoneId_date_hourOfDay_key" ON "analytics_waste_pattern"("zoneId","date","hourOfDay")`,
      `CREATE INDEX IF NOT EXISTS "analytics_waste_pattern_zoneId_hourOfDay_idx" ON "analytics_waste_pattern"("zoneId","hourOfDay")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_worker_daily_workerId_date_key" ON "analytics_worker_daily"("workerId","date")`,
      `CREATE INDEX IF NOT EXISTS "analytics_worker_daily_date_idx" ON "analytics_worker_daily"("date")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_photo_meta_mediaId_key" ON "analytics_photo_meta"("mediaId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_photo_meta_taskId_idx" ON "analytics_photo_meta"("taskId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_photo_meta_isFlagged_idx" ON "analytics_photo_meta"("isFlagged")`,
      `CREATE INDEX IF NOT EXISTS "analytics_photo_meta_uploaderId_idx" ON "analytics_photo_meta"("uploaderId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_behavior_event_userId_idx" ON "analytics_behavior_event"("userId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_behavior_event_eventType_idx" ON "analytics_behavior_event"("eventType")`,
      `CREATE INDEX IF NOT EXISTS "analytics_behavior_event_createdAt_idx" ON "analytics_behavior_event"("createdAt")`,
      `CREATE INDEX IF NOT EXISTS "analytics_behavior_event_sessionId_idx" ON "analytics_behavior_event"("sessionId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_behavior_event_eventType_createdAt_idx" ON "analytics_behavior_event"("eventType","createdAt")`,
      `CREATE INDEX IF NOT EXISTS "analytics_data_export_log_apiKeyId_idx" ON "analytics_data_export_log"("apiKeyId")`,
      `CREATE INDEX IF NOT EXISTS "analytics_data_export_log_createdAt_idx" ON "analytics_data_export_log"("createdAt")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "analytics_api_key_keyHash_key" ON "analytics_api_key"("keyHash")`,
      `CREATE INDEX IF NOT EXISTS "analytics_api_key_isActive_idx" ON "analytics_api_key"("isActive")`,
    ]
    const { PrismaClient } = await import('@prisma/client')
    const db = new PrismaClient()
    try {
      for (const q of tables) { await db.$executeRawUnsafe(q); results.push('TABLE OK') }
      for (const q of indexes) { await db.$executeRawUnsafe(q); results.push('INDEX OK') }
      await db.$executeRawUnsafe(`INSERT INTO "User" (id,email,name,role,"passwordHash","isActive","isEmailVerified","createdAt","updatedAt") VALUES (gen_random_uuid(),'admin@eclean.test','eClean Admin','ADMIN','$2b$10$o6PEFfk4F8kUa7GS1qmIiemUNhKQyKxEcAVaEu4nxTn1dO8yRQMOy',true,true,NOW(),NOW()) ON CONFLICT (email) DO UPDATE SET "passwordHash"='$2b$10$o6PEFfk4F8kUa7GS1qmIiemUNhKQyKxEcAVaEu4nxTn1dO8yRQMOy',"isActive"=true,role='ADMIN'`)
      results.push('ADMIN USER OK')
      await db.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,finished_at,applied_steps_count) VALUES (gen_random_uuid(),'manual','20260328184537_add_analytics_intelligence_layer',NOW(),1) ON CONFLICT DO NOTHING`)
      results.push('MIGRATION RECORD OK')
    } catch (err: any) { results.push('ERROR: ' + err.message) }
    finally { await db.$disconnect() }
    return reply.send({ ok: true, count: results.length, results })
  })

  return app
}
