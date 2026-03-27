import { Redis } from 'ioredis'
import { env } from '../config/env'

const tlsOptions = env.REDIS_URL.startsWith('rediss://')
  ? { tls: {} }
  : {}

export const redis = new Redis(env.REDIS_URL, {
  ...tlsOptions,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
})

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err.message)
})

redis.on('connect', () => {
  console.log('[Redis] Connected')
})
