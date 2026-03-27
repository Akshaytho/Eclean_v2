// eClean — Shared BullMQ connection factory
// BullMQ must own its own ioredis connection — do not share the singleton from redis.ts

import { env } from '../config/env'

function parseBullMQConnection(redisUrl: string) {
  const url   = new URL(redisUrl)
  const isTls = url.protocol === 'rediss:'
  return {
    host:     url.hostname,
    port:     parseInt(url.port || (isTls ? '6380' : '6379'), 10),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(isTls         && { tls: {} }),
    ...(url.pathname && url.pathname !== '/' && { db: parseInt(url.pathname.slice(1), 10) }),
  }
}

export const bullmqConnection = parseBullMQConnection(env.REDIS_URL)
