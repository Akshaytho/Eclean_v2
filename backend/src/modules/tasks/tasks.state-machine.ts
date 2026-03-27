import { TaskStatus } from '@prisma/client'
import { BadRequestError } from '../../lib/errors'

export type Actor = 'BUYER' | 'WORKER' | 'SYSTEM'

// [from, to, allowedActors]
const TRANSITIONS: Array<[TaskStatus, TaskStatus, Actor[]]> = [
  ['OPEN',        'ACCEPTED',    ['WORKER']],
  ['OPEN',        'CANCELLED',   ['BUYER']],
  ['ACCEPTED',    'IN_PROGRESS', ['WORKER']],
  ['ACCEPTED',    'CANCELLED',   ['BUYER', 'WORKER']],
  ['IN_PROGRESS', 'SUBMITTED',   ['WORKER']],
  ['IN_PROGRESS', 'CANCELLED',   ['BUYER', 'WORKER']],
  ['SUBMITTED',   'APPROVED',    ['BUYER']],
  ['SUBMITTED',   'REJECTED',    ['BUYER']],           // buyer rejects work
  ['SUBMITTED',   'DISPUTED',    ['BUYER', 'WORKER']],
  ['REJECTED',    'IN_PROGRESS', ['WORKER']],          // worker retries after rejection
  ['REJECTED',    'DISPUTED',    ['WORKER']],           // worker disputes the rejection
  ['APPROVED',    'COMPLETED',   ['SYSTEM']],
  ['DISPUTED',    'APPROVED',    ['SYSTEM']],
  ['DISPUTED',    'CANCELLED',   ['SYSTEM']],
]

/**
 * Throws BadRequestError if the transition is not allowed.
 * Call before every status update.
 */
export function assertTransition(from: TaskStatus, to: TaskStatus, actor: Actor): void {
  const valid = TRANSITIONS.find(
    ([f, t, actors]) => f === from && t === to && actors.includes(actor),
  )
  if (!valid) {
    throw new BadRequestError(`Transition ${from} → ${to} by ${actor} is not allowed`)
  }
}

export function getValidTransitions(from: TaskStatus, actor: Actor): TaskStatus[] {
  return TRANSITIONS
    .filter(([f, , actors]) => f === from && actors.includes(actor))
    .map(([, t]) => t)
}
