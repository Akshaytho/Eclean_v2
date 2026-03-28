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

  app.get('/health', async () => ({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  }))

  return app
}
