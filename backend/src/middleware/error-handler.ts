import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

/**
 * Fastify setErrorHandler — centralised error handling.
 * AppErrors are serialised directly. All other errors are masked in production.
 */
export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    const body: Record<string, unknown> = {
      code: error.code,
      message: error.message,
    }
    if (error.details !== undefined) {
      body.details = error.details
    }
    void reply.status(error.statusCode).send({ error: body })
    return
  }

  // Fastify validation errors (schema-level, not our Zod middleware)
  const fastifyError = error as Error & { statusCode?: number; validation?: unknown }
  if (fastifyError.statusCode === 400 && fastifyError.validation) {
    void reply.status(400).send({
      error: { code: 'BAD_REQUEST', message: error.message },
    })
    return
  }

  // Unexpected — log full details, never leak stack in production
  logger.error(
    { err: error, method: request.method, url: request.url },
    'Unhandled error',
  )

  void reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
    },
  })
}
