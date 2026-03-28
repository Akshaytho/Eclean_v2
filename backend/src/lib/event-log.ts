// eClean — EventLog utility
//
// PURPOSE:
//   Records every mutation in the system to the analytics_event_log table.
//   This is the universal audit trail and the bridge for future admin separation.
//
// DESIGN:
//   - Fire-and-forget: never throws, never blocks the calling service.
//   - Failures are logged but silently swallowed — event logging must NEVER
//     prevent a real operation from completing.
//   - Every service calls logEvent() after its mutation succeeds.
//   - The payload should be a self-contained snapshot of what happened,
//     so future consumers don't need to join core tables.
//
// FUTURE:
//   When admin splits to a separate repo, this function becomes a publisher
//   to a Redis Stream or message queue. The analytics service subscribes.
//   Zero changes to calling code — same function signature, different transport.

import { prisma } from './prisma'
import { logger } from './logger'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventLogInput {
  /** What type of entity changed: TASK, USER, ZONE, REPORT, PAYOUT, MEDIA, CHAT, etc. */
  entity: string
  /** UUID of the thing that changed */
  entityId: string
  /** What happened: created, status_changed, photo_uploaded, approved, etc. */
  action: string
  /** Who did it — null/undefined for SYSTEM actions (cron jobs, webhooks) */
  actorId?: string | null | undefined
  /** Role of the actor — null/undefined for SYSTEM */
  actorRole?: string | null | undefined
  /** Self-contained data snapshot. Include enough so consumers never need to query core tables. */
  payload?: Record<string, unknown> | null | undefined
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Log a mutation event to the analytics event log.
 *
 * USAGE (in any service function, AFTER the main operation succeeds):
 *
 *   await prisma.task.update(...)  // main operation
 *   void logEvent({                // fire-and-forget (note the void — don't await)
 *     entity:    'TASK',
 *     entityId:  taskId,
 *     action:    'status_changed',
 *     actorId:   workerId,
 *     actorRole: 'WORKER',
 *     payload:   { from: 'OPEN', to: 'ACCEPTED', taskTitle: task.title },
 *   })
 *
 * The `void` prefix is intentional — it tells TypeScript we're deliberately
 * not awaiting the promise. The event is written asynchronously without
 * blocking the HTTP response.
 */
export async function logEvent(input: EventLogInput): Promise<void> {
  try {
    const data: Record<string, unknown> = {
      entity:    input.entity,
      entityId:  input.entityId,
      action:    input.action,
      actorId:   input.actorId ?? null,
      actorRole: input.actorRole ?? null,
    }
    if (input.payload != null) {
      data.payload = input.payload
    }
    await prisma.eventLog.create({ data: data as any })
  } catch (err) {
    // NEVER throw — event logging failure must not surface to the caller.
    // The main operation already succeeded. Log the failure and move on.
    logger.error(
      { err, entity: input.entity, entityId: input.entityId, action: input.action },
      'EventLog write failed — event lost (non-fatal)',
    )
  }
}

// ─── Batch variant ────────────────────────────────────────────────────────────

/**
 * Log multiple events in a single DB round-trip.
 * Used by the behavior events endpoint (mobile sends batches of 50+).
 *
 * Same fire-and-forget pattern — swallows errors silently.
 */
export async function logEventBatch(events: EventLogInput[]): Promise<void> {
  if (events.length === 0) return

  try {
    await prisma.eventLog.createMany({
      data: events.map((e) => {
        const row: Record<string, unknown> = {
          entity:    e.entity,
          entityId:  e.entityId,
          action:    e.action,
          actorId:   e.actorId ?? null,
          actorRole: e.actorRole ?? null,
        }
        if (e.payload != null) row.payload = e.payload
        return row
      }) as any,
    })
  } catch (err) {
    logger.error(
      { err, count: events.length },
      'EventLog batch write failed — events lost (non-fatal)',
    )
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────────────
// These remove boilerplate in the most common call sites.

export function logTaskEvent(
  taskId: string,
  action: string,
  actorId: string | null,
  actorRole: string | null,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'TASK', entityId: taskId, action, actorId, actorRole, payload })
}

export function logPayoutEvent(
  payoutId: string,
  action: string,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'PAYOUT', entityId: payoutId, action, actorId: null, actorRole: 'SYSTEM', payload })
}

export function logMediaEvent(
  mediaId: string,
  action: string,
  actorId: string,
  actorRole: string,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'MEDIA', entityId: mediaId, action, actorId, actorRole, payload })
}

export function logUserEvent(
  userId: string,
  action: string,
  actorId?: string | null,
  actorRole?: string | null,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'USER', entityId: userId, action, actorId, actorRole, payload })
}

export function logZoneEvent(
  zoneId: string,
  action: string,
  actorId: string | null,
  actorRole: string | null,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'ZONE', entityId: zoneId, action, actorId, actorRole, payload })
}

export function logReportEvent(
  reportId: string,
  action: string,
  actorId: string,
  actorRole: string,
  payload?: Record<string, unknown>,
): void {
  void logEvent({ entity: 'REPORT', entityId: reportId, action, actorId, actorRole, payload })
}
