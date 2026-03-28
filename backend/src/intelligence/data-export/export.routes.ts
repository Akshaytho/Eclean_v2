// eClean — Data Export routes (B2B)
//
// Authenticated via API keys (x-api-key header), NOT JWT.
// All responses are anonymized — no PII leaves this module.
// Every call is logged to DataExportLog for DPDP Act compliance.
//
// SEPARATION RULE: This module moves to the admin repo when it splits.

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { validate } from '../../middleware/validate'
import { apiKeyAuth } from '../../middleware/api-key-auth'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import * as svc from './export.service'
import {
  zonesExportSchema,
  wastePatternsSchema,
  cleanlinessIndexSchema,
  drainRiskSchema,
  type ZonesExportQuery,
  type WastePatternsQuery,
  type CleanlinessIndexQuery,
  type DrainRiskQuery,
} from './export.schema'

// ─── Audit logger ─────────────────────────────────────────────────────────────

async function logExport(
  request: FastifyRequest,
  endpoint: string,
  params: Record<string, unknown>,
  rowCount: number,
  startTime: number,
): Promise<void> {
  if (!request.apiKey) return
  try {
    await prisma.dataExportLog.create({
      data: {
        apiKeyId:         request.apiKey.id,
        organizationName: request.apiKey.organizationName,
        endpoint,
        params:           params as any,
        rowCount,
        ipAddress:        request.ip ?? null,
        responseTimeMs:   Math.round(Date.now() - startTime),
      },
    })
  } catch (err) {
    logger.error({ err, endpoint }, 'DataExportLog write failed (non-fatal)')
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function dataExportRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /api/v1/data/zones?city=&from=&to=&format=geojson
  fastify.get<{ Querystring: ZonesExportQuery }>(
    '/zones',
    {
      preHandler: [
        apiKeyAuth(['zones']),
        validate({ query: zonesExportSchema }),
      ],
    },
    async (request, reply) => {
      const start = Date.now()
      const result = await svc.exportZones(request.query)
      const count = 'features' in result ? result.features.length : (result as any).count ?? 0
      void logExport(request, '/data/zones', request.query as any, count, start)
      return reply.send(result)
    },
  )

  // GET /api/v1/data/waste-patterns?city=&from=&to=
  fastify.get<{ Querystring: WastePatternsQuery }>(
    '/waste-patterns',
    {
      preHandler: [
        apiKeyAuth(['waste_patterns']),
        validate({ query: wastePatternsSchema }),
      ],
    },
    async (request, reply) => {
      const start = Date.now()
      const result = await svc.exportWastePatterns(request.query)
      void logExport(request, '/data/waste-patterns', request.query as any, result.count, start)
      return reply.send(result)
    },
  )

  // GET /api/v1/data/cleanliness-index?city=&months=6
  fastify.get<{ Querystring: CleanlinessIndexQuery }>(
    '/cleanliness-index',
    {
      preHandler: [
        apiKeyAuth(['cleanliness_index']),
        validate({ query: cleanlinessIndexSchema }),
      ],
    },
    async (request, reply) => {
      const start = Date.now()
      const result = await svc.exportCleanlinessIndex(request.query)
      void logExport(request, '/data/cleanliness-index', request.query as any, result.count, start)
      return reply.send(result)
    },
  )

  // GET /api/v1/data/drain-risk?city=&season=
  fastify.get<{ Querystring: DrainRiskQuery }>(
    '/drain-risk',
    {
      preHandler: [
        apiKeyAuth(['drain_risk']),
        validate({ query: drainRiskSchema }),
      ],
    },
    async (request, reply) => {
      const start = Date.now()
      const result = await svc.exportDrainRisk(request.query)
      void logExport(request, '/data/drain-risk', request.query as any, result.count, start)
      return reply.send(result)
    },
  )
}
