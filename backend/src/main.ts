import 'dotenv/config'
import * as Sentry from '@sentry/node'
import { buildApp } from './app'
import { env } from './config/env'
import { initSocket } from './realtime/socket'
import { createAiVerifyWorker } from './jobs/ai-verify.job'
import { createPayoutWorker } from './jobs/payout.job'
import { createCleanupWorker, scheduleCleanupJobs } from './jobs/cleanup.job'
import { createAnalyticsWorker, scheduleAnalyticsJobs } from './jobs/analytics-aggregate.job'

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn:              env.SENTRY_DSN,
    environment:      env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
  })
}

// ── Boot ───────────────────────────────────────────────────────────────────────
const start = async (): Promise<void> => {
  const app = await buildApp()
  try {
    // Log Razorpay mode at startup
    const razorpayMode = env.RAZORPAY_KEY_ID === 'test_mode'
      ? 'test_mode (immediate COMPLETED)'
      : env.RAZORPAY_KEY_ID
        ? 'production'
        : 'unconfigured'
    app.log.info({ razorpayMode }, 'Razorpay initialised')

    // Start BullMQ workers
    const aiWorker        = createAiVerifyWorker()
    const payoutWorker    = createPayoutWorker()
    const cleanupWorker   = createCleanupWorker()
    const analyticsWorker = createAnalyticsWorker()
    await scheduleCleanupJobs()
    await scheduleAnalyticsJobs()

    // Attach Socket.io to Fastify's underlying http.Server before listen
    await app.ready()
    initSocket(app.server)

    await app.listen({ port: env.PORT, host: '0.0.0.0' })

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      await aiWorker.close()
      await payoutWorker.close()
      await cleanupWorker.close()
      await analyticsWorker.close()
      await app.close()
      process.exit(0)
    }
    process.once('SIGTERM', () => { void shutdown() })
    process.once('SIGINT',  () => { void shutdown() })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
