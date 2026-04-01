import { Redis } from 'ioredis'
import { env } from '../config/env'
import { logger } from './logger'

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
  logger.error({ err: err.message }, 'Redis connection error')
})

redis.on('connect', () => {
  logger.info('Redis connected')
})
