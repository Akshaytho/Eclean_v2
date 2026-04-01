import { defineConfig } from 'vitest/config'
import { config as loadDotenv } from 'dotenv'

// Load .env so DATABASE_URL / REDIS_URL are available as fallbacks below
loadDotenv()

// Use a separate Redis DB for tests (DB 1) to avoid dev server BullMQ worker interference
const baseRedisUrl = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '')
const testRedisUrl = baseRedisUrl + '/1'

export default defineConfig({
  test: {
    environment: 'node',
    globals:      true,
    testTimeout:  30_000,
    hookTimeout:  30_000,
    clearMocks:   true,
    restoreMocks: true,
    // Run test files sequentially — cleanTestData() deletes all @eclean.test rows
    // and parallel files would race-delete each other's in-flight data.
    fileParallelism: false,
    pool: 'forks',
    // Env vars set before any import — dotenv in env.ts will NOT override these
    env: {
      NODE_ENV:           'test',
      DATABASE_URL:       process.env.DATABASE_URL   ?? '',
      REDIS_URL:          testRedisUrl,
      JWT_ACCESS_SECRET:  'test-access-secret-minimum-32-characters!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters!',
      BCRYPT_ROUNDS:      '10',
      CORS_ORIGINS:       'http://localhost:3001',
      FRONTEND_URL:       'http://localhost:3001',
      RAZORPAY_KEY_ID:    'test_mode',
      RAZORPAY_KEY_SECRET:'test_mode',
      OPENAI_API_KEY:     'test_mode',
    },
  },
})
