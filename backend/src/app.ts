import crypto from 'node:crypto'
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
import { paymentRoutes } from './modules/payments/payment.routes'
import { analyticsRoutes } from './intelligence/analytics/analytics.routes'
import { dataExportRoutes } from './intelligence/data-export/export.routes'
import { referencePointRoutes } from './modules/reference-points/reference-points.routes'
import { environmentRoutes } from './modules/environment/environment.routes'
import { citizenVerifyRoutes } from './modules/citizen-verify/citizen-verify.routes'
import { aiVerifyQueue } from './jobs/ai-verify.job'
import { paymentReleaseQueue } from './jobs/payment-release.job'
import type { FastifyInstance } from 'fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
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

  // Return the request ID in every response so clients can reference it
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id)
  })

  // ── Plugins ──────────────────────────────────────────────────────────────────
  // SECURITY: always use explicit CORS origins — never allow all origins
  // `origin: true` in dev allowed any website to make authenticated requests
  void app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
  })
  void app.register(helmet, { contentSecurityPolicy: false })
  void app.register(cookie)
  void app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  })
  // PERF: global rate limit — prevents DoS on unprotected endpoints
  // Uses JWT user ID for authenticated requests, falls back to IP
  void app.register(rateLimit, {
    global: true,
    max: env.NODE_ENV === 'production' ? 100 : 10000,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req as any).user?.id ?? req.ip,
  })

  // Allow empty body for application/json + capture raw body for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (body as string).length === 0) { done(null, {}); return }
    // Store raw body for webhook signature verification (Razorpay, etc.)
    ;(req as any).rawBody = body as string
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
  void app.register(referencePointRoutes, { prefix: '/api/v1/tasks' })
  void app.register(environmentRoutes,    { prefix: '/api/v1/tasks' })
  void app.register(zoneRoutes,          { prefix: '/api/v1/zones' })
  void app.register(supervisorRoutes,    { prefix: '/api/v1/supervisor' })
  void app.register(citizenRoutes,       { prefix: '/api/v1/citizen' })
  void app.register(citizenVerifyRoutes, { prefix: '/api/v1/citizen' })
  void app.register(adminRoutes,         { prefix: '/api/v1/admin' })
  void app.register(notificationsRoutes, { prefix: '/api/v1/notifications' })
  void app.register(payoutsRoutes,       { prefix: '/api/v1' })
  void app.register(paymentRoutes,       { prefix: '/api/v1/buyer/payments' })
  void app.register(analyticsRoutes,     { prefix: '/api/v1/analytics' }) // analytics + behavior events
  void app.register(dataExportRoutes,    { prefix: '/api/v1/data' })      // B2B data export (API key auth)

  app.get('/health', async () => {
    const [aiQueueCount, paymentQueueCount] = await Promise.all([
      aiVerifyQueue.getWaitingCount(),
      paymentReleaseQueue.getWaitingCount(),
    ])
    return {
      status:    'ok',
      timestamp: new Date().toISOString(),
      env:       env.NODE_ENV,
      queues: { ai_verify: aiQueueCount, payment_release: paymentQueueCount },
    }
  })


  return app
}
