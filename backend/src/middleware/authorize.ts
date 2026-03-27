import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@prisma/client'
import { ForbiddenError } from '../lib/errors'

/**
 * Returns a preHandler that asserts request.user.role is in allowedRoles.
 * Must be used after `authenticate`.
 */
export function authorize(allowedRoles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Role ${request.user.role} is not permitted to access this resource`,
      )
    }
  }
}
