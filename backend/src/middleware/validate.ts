import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodSchema, ZodError } from 'zod'
import { ValidationError } from '../lib/errors'

interface ValidateSchemas {
  body?: ZodSchema
  params?: ZodSchema
  query?: ZodSchema
}

/**
 * Returns a preHandler that runs Zod validation on body / params / query.
 * On failure throws ValidationError (422) with fieldErrors as details.
 */
export function validate(schemas: ValidateSchemas) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    try {
      if (schemas.body !== undefined) {
        request.body = schemas.body.parse(request.body)
      }
      if (schemas.params !== undefined) {
        request.params = schemas.params.parse(request.params)
      }
      if (schemas.query !== undefined) {
        request.query = schemas.query.parse(request.query)
      }
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationError('Validation failed', err.flatten().fieldErrors)
      }
      throw err
    }
  }
}
