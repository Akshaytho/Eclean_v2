// eClean — Analytics routes
//
// Phase 2: POST /api/v1/analytics/events — behavior event batch ingestion
// Phase 4: GET endpoints for zone trends, heatmaps, leaderboards, etc.
//
// SEPARATION RULE: This module NEVER imports from core modules
// (auth, tasks, zones, media). It reads raw data via its own Prisma queries.
// When admin splits to a separate repo, this module moves cleanly.

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { behaviorEventBatchSchema, dateRangeQuerySchema, zoneIdParamSchema, leaderboardQuerySchema, cityQuerySchema, type BehaviorEventBatchInput, type DateRangeQuery, type LeaderboardQuery, type CityQuery } from './analytics.schema'
import * as svc from './analytics.service'

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/v1/analytics/events ─────────────────────────────────────────
  // Mobile sends batches of behavior events (task_viewed, search_performed, etc.)
  // Any authenticated user can send events. Writes are fire-and-forget.
  //
  // Body: { events: [{ eventType, entityType?, entityId?, payload?, sessionId?, timestamp? }] }
  // Max 100 events per call. Mobile should batch and send every 30s or on app background.
  fastify.post<{ Body: BehaviorEventBatchInput }>(
    '/events',
    {
      preHandler: [authenticate, validate({ body: behaviorEventBatchSchema })],
    },
    async (request, reply) => {
      const { events } = request.body
      const userId   = request.user.id
      const userRole = request.user.role

      try {
        await prisma.analyticsBehaviorEvent.createMany({
          data: events.map((e) => {
            const row: Record<string, unknown> = {
              userId,
              userRole,
              eventType:  e.eventType,
              entityType: e.entityType ?? null,
              entityId:   e.entityId   ?? null,
              sessionId:  e.sessionId  ?? null,
            }
            if (e.payload != null) row.payload = e.payload
            if (e.timestamp) row.createdAt = new Date(e.timestamp)
            return row
          }) as any,
        })
      } catch (err) {
        // Behavior event ingestion failure is non-critical.
        // Log but still return 200 — mobile should not retry these.
        logger.error({ err, count: events.length }, 'Behavior event batch write failed (non-fatal)')
      }

      // Always 200 — even on failure. These events are best-effort.
      // Mobile should not retry or queue on failure.
      return reply.status(200).send({
        accepted: events.length,
      })
    },
  )

  // ── Phase 4: Analytics GET endpoints ────────────────────────────────────────

  const adminAuth = [authenticate, authorize(['ADMIN'])]
  const supervisorAuth = [authenticate, authorize(['ADMIN', 'SUPERVISOR'])]

  // GET /api/v1/analytics/zones/:id/trend?days=30
  fastify.get<{ Params: { id: string }; Querystring: DateRangeQuery }>(
    '/zones/:id/trend',
    { preHandler: [...supervisorAuth, validate({ params: zoneIdParamSchema, query: dateRangeQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getZoneTrend(request.params.id, request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/zones/heatmap?city=&from=&to=
  fastify.get<{ Querystring: CityQuery }>(
    '/zones/heatmap',
    { preHandler: [...adminAuth, validate({ query: cityQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getZoneHeatmap(request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/platform?days=30&from=&to=
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/platform',
    { preHandler: [...adminAuth, validate({ query: dateRangeQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getPlatformMetrics(request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/workers/leaderboard?period=week&limit=10
  fastify.get<{ Querystring: LeaderboardQuery }>(
    '/workers/leaderboard',
    { preHandler: [...adminAuth, validate({ query: leaderboardQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getWorkerLeaderboard(request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/workers/:id/trend?days=30
  fastify.get<{ Params: { id: string }; Querystring: DateRangeQuery }>(
    '/workers/:id/trend',
    { preHandler: [...adminAuth, validate({ params: zoneIdParamSchema, query: dateRangeQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getWorkerTrend(request.params.id, request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/photo-fraud?days=30
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/photo-fraud',
    { preHandler: [...adminAuth, validate({ query: dateRangeQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getPhotoFraudFlags(request.query)
      return reply.send(result)
    },
  )

  // GET /api/v1/analytics/supply-demand?city=
  fastify.get<{ Querystring: { city?: string } }>(
    '/supply-demand',
    { preHandler: [...adminAuth, validate({ query: cityQuerySchema })] },
    async (request, reply) => {
      const result = await svc.getSupplyDemand(request.query.city)
      return reply.send(result)
    },
  )
}
