// eClean — AI Verification Engine API Routes
//
// Endpoints for:
// 1. Admin review queue (tasks needing manual review)
// 2. Verification details (full engine output for any task)
// 3. Worker trust profiles
// 4. Accuracy/calibration analytics
// 5. Fraud report details

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import * as ctrl from './ai.controller'

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  const adminAuth = [authenticate, authorize(['ADMIN', 'SUPERVISOR'])]
  const anyAuth   = [authenticate]

  // ── Review Queue (Admin/Supervisor only) ──────────────────────────────

  // GET /api/v1/ai/review-queue — tasks needing manual review
  fastify.get('/review-queue', { preHandler: adminAuth }, ctrl.getReviewQueue)

  // GET /api/v1/ai/review-queue/stats — review queue statistics
  fastify.get('/review-queue/stats', { preHandler: adminAuth }, ctrl.getReviewQueueStats)

  // ── Verification Details ──────────────────────────────────────────────

  // GET /api/v1/ai/verification/:taskId — full verification result for a task
  fastify.get('/verification/:taskId', { preHandler: anyAuth }, ctrl.getVerificationDetail)

  // GET /api/v1/ai/verification/:taskId/history — all verification attempts
  fastify.get('/verification/:taskId/history', { preHandler: anyAuth }, ctrl.getVerificationHistory)

  // ── Worker Trust ──────────────────────────────────────────────────────

  // GET /api/v1/ai/trust/:workerId — worker trust profile
  fastify.get('/trust/:workerId', { preHandler: adminAuth }, ctrl.getWorkerTrust)

  // GET /api/v1/ai/trust/leaderboard — top trusted workers
  fastify.get('/trust/leaderboard', { preHandler: adminAuth }, ctrl.getTrustLeaderboard)

  // ── Accuracy & Calibration (Admin only) ───────────────────────────────

  // GET /api/v1/ai/accuracy — accuracy report
  fastify.get('/accuracy', { preHandler: [authenticate, authorize(['ADMIN'])] }, ctrl.getAccuracy)
}
