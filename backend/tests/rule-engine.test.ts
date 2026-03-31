/**
 * Rule Engine — Unit Tests (pure functions, no DB required)
 *
 * Tests the pluggable scoring pipeline with realistic human behavior scenarios:
 * - Perfect honest worker
 * - Worker who skips some points
 * - Worker who rushes the job
 * - Worker who photographs from wrong location (GPS mismatch)
 * - Legacy task with no reference points
 * - Environmental DNA bonus
 * - Motion signature bonus
 */

import { describe, it, expect } from 'vitest'
import {
  computeTaskConfidence,
  DECISION_THRESHOLDS,
  type ScoringContext,
} from '../src/modules/verification/rule-engine'
import type { Task, TaskReferencePoint, WorkerPointSubmission } from '@prisma/client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'Clean the area',
    category: 'STREET_CLEANING',
    status: 'SUBMITTED',
    urgency: 'MEDIUM',
    dirtyLevel: 'MEDIUM',
    rateCents: 50000,
    currency: 'INR',
    buyerId: 'buyer-1',
    workerId: 'worker-1',
    zoneId: null,
    locationLat: 12.97,
    locationLng: 77.59,
    locationAddress: 'Test Location',
    workWindowStart: '07:00',
    workWindowEnd: '11:30',
    uploadWindowEnd: '12:00',
    timezone: 'Asia/Kolkata',
    razorpayOrderId: null,
    razorpayPaymentId: null,
    aiScore: null,
    aiReasoning: null,
    aiModelVersion: null,
    rejectionReason: null,
    cancellationReason: null,
    startedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 min ago
    submittedAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    timeSpentSecs: 2700, // 45 min
    createdAt: new Date(),
    updatedAt: new Date(),
    indoorOutdoor: 'OUTDOOR',
    totalReferencePoints: 5,
    areaSizeEstimate: 'MEDIUM',
    workStartedAt: new Date(Date.now() - 45 * 60 * 1000),
    workDurationSecs: 2700,
    ruleEngineScore: null,
    ruleEngineBreakdown: null,
    adversarialScore: null,
    adversarialAnomalies: null,
    finalDecision: null,
    ...overrides,
  } as Task
}

function makeRefPoint(overrides: Partial<TaskReferencePoint> & { id: string; pointIndex: number }): TaskReferencePoint {
  return {
    taskId: 'task-1',
    label: `Point ${overrides.pointIndex}`,
    buyerImageUrl: `https://cloudinary.com/ref_${overrides.pointIndex}.jpg`,
    buyerImagePublicId: null,
    buyerLat: 12.97 + overrides.pointIndex * 0.0001,
    buyerLng: 77.59 + overrides.pointIndex * 0.0001,
    buyerHeading: null,
    isVerificationPoint: false,
    createdAt: new Date(),
    ...overrides,
  } as TaskReferencePoint
}

function makeSubmission(overrides: Partial<WorkerPointSubmission> & { referencePointId: string; mediaType: 'AFTER' | 'VERIFICATION' }): WorkerPointSubmission {
  const uid = Math.random().toString(36).slice(2)
  return {
    id: `sub-${uid}`,
    taskId: 'task-1',
    workerId: 'worker-1',
    imageUrl: `https://cloudinary.com/worker_${uid}.jpg`,
    imagePublicId: null,
    workerLat: 12.97,
    workerLng: 77.59,
    workerHeading: null,
    photoHash: `hash_${uid}`,
    capturedAt: new Date(),
    deviceId: 'test-device',
    idempotencyKey: null,
    status: 'UPLOADED',
    locationMatchScore: 90,
    createdAt: new Date(),
    ...overrides,
  } as WorkerPointSubmission
}

// ─── Scenario: Perfect honest worker ─────────────────────────────────────────

describe('Rule Engine — Perfect Worker', () => {
  it('scores 100/100 with full coverage, all verification, good GPS, enough time', () => {
    const refPoints = [
      makeRefPoint({ id: 'p1', pointIndex: 1, isVerificationPoint: true }),
      makeRefPoint({ id: 'p2', pointIndex: 2, isVerificationPoint: true }),
      makeRefPoint({ id: 'p3', pointIndex: 3 }),
      makeRefPoint({ id: 'p4', pointIndex: 4 }),
      makeRefPoint({ id: 'p5', pointIndex: 5 }),
    ]

    const submissions = [
      makeSubmission({ referencePointId: 'p1', mediaType: 'VERIFICATION', locationMatchScore: 100 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'VERIFICATION', locationMatchScore: 95 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 100 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'AFTER', locationMatchScore: 95 }),
      makeSubmission({ referencePointId: 'p3', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p4', mediaType: 'AFTER', locationMatchScore: 85 }),
      makeSubmission({ referencePointId: 'p5', mediaType: 'AFTER', locationMatchScore: 90 }),
    ]

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 2700, workDurationSecs: 2700 }),
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)

    expect(result.breakdown.verification_completeness.score).toBe(20)
    expect(result.breakdown.photo_coverage.score).toBe(25)
    expect(result.breakdown.duplicate_image_check.score).toBe(15)
    expect(result.normalizedScore).toBeGreaterThanOrEqual(85)
    expect(result.decision).toBe('AUTO_PASS')
    expect(result.flags).toHaveLength(0)
  })
})

// ─── Scenario: Worker skips some points ──────────────────────────────────────

describe('Rule Engine — Partial Coverage', () => {
  it('scores lower when only 3/5 after photos uploaded', () => {
    const refPoints = [
      makeRefPoint({ id: 'p1', pointIndex: 1, isVerificationPoint: true }),
      makeRefPoint({ id: 'p2', pointIndex: 2, isVerificationPoint: true }),
      makeRefPoint({ id: 'p3', pointIndex: 3 }),
      makeRefPoint({ id: 'p4', pointIndex: 4 }),
      makeRefPoint({ id: 'p5', pointIndex: 5 }),
    ]

    const submissions = [
      makeSubmission({ referencePointId: 'p1', mediaType: 'VERIFICATION', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'VERIFICATION', locationMatchScore: 85 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'AFTER', locationMatchScore: 85 }),
      makeSubmission({ referencePointId: 'p3', mediaType: 'AFTER', locationMatchScore: 80 }),
      // p4, p5 NOT captured
    ]

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 1800 }),
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)

    expect(result.breakdown.photo_coverage.score).toBe(15) // 3/5 * 25 = 15
    expect(result.normalizedScore).toBeLessThan(85) // won't auto-pass
    expect(result.decision).toBe('MANUAL_REVIEW')
  })

  it('flags LOW_COVERAGE when less than half of points covered', () => {
    const refPoints = Array.from({ length: 6 }, (_, i) =>
      makeRefPoint({ id: `p${i}`, pointIndex: i + 1, isVerificationPoint: i < 2 }),
    )

    const submissions = [
      makeSubmission({ referencePointId: 'p0', mediaType: 'VERIFICATION', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'VERIFICATION', locationMatchScore: 85 }),
      makeSubmission({ referencePointId: 'p0', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 85 }),
      // 2/6 = 33% coverage
    ]

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 1200 }),
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)
    expect(result.flags).toContain('LOW_COVERAGE')
  })
})

// ─── Scenario: Worker rushes the job ─────────────────────────────────────────

describe('Rule Engine — Rushed Job', () => {
  it('penalizes when worker spends 3 minutes on a 5-point task', () => {
    const refPoints = Array.from({ length: 5 }, (_, i) =>
      makeRefPoint({ id: `p${i}`, pointIndex: i + 1, isVerificationPoint: i < 2 }),
    )

    const submissions = refPoints.map((p) =>
      makeSubmission({ referencePointId: p.id, mediaType: p.isVerificationPoint ? 'VERIFICATION' : 'AFTER', locationMatchScore: 90 }),
    )
    // Also add AFTER for verification points
    submissions.push(
      makeSubmission({ referencePointId: 'p0', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 90 }),
    )

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 180, workDurationSecs: 180 }), // 3 minutes
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)

    // Time on site should be very low (3 min vs expected 15 min)
    expect(result.breakdown.time_on_site.score).toBeLessThan(5)
    expect(result.flags).toContain('LOW_TIME_ON_SITE')
  })
})

// ─── Scenario: Worker photographs from wrong location ────────────────────────

describe('Rule Engine — GPS Mismatch (possible fraud)', () => {
  it('penalizes when GPS scores are very low', () => {
    const refPoints = [
      makeRefPoint({ id: 'p1', pointIndex: 1, isVerificationPoint: true }),
      makeRefPoint({ id: 'p2', pointIndex: 2, isVerificationPoint: true }),
      makeRefPoint({ id: 'p3', pointIndex: 3 }),
    ]

    const submissions = [
      makeSubmission({ referencePointId: 'p1', mediaType: 'VERIFICATION', locationMatchScore: 10 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'VERIFICATION', locationMatchScore: 0 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 10 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'AFTER', locationMatchScore: 0 }),
      makeSubmission({ referencePointId: 'p3', mediaType: 'AFTER', locationMatchScore: 15 }),
    ]

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 2700 }),
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)

    expect(result.breakdown.gps_proximity.score).toBeLessThan(5) // avg ~7/100
    expect(result.breakdown.fraud_flags.score).toBeLessThan(10) // multiple low-GPS photos
    expect(result.flags).toContain('LOW_GPS_MATCH')
    expect(result.decision).toBe('REJECT')
  })
})

// ─── Scenario: Legacy task with no reference points ──────────────────────────

describe('Rule Engine — Legacy Task (0 reference points)', () => {
  it('gives full marks for verification and coverage when no points exist', () => {
    const ctx: ScoringContext = {
      task: makeTask({ totalReferencePoints: 0, timeSpentSecs: 2700 }),
      referencePoints: [],
      submissions: [],
    }

    const result = computeTaskConfidence(ctx)

    // No reference points = verification is N/A = full marks
    expect(result.breakdown.verification_completeness.score).toBe(20)
    expect(result.breakdown.photo_coverage.score).toBe(25)
    // GPS = 0 (no submissions), Time = full, Fraud = full
    expect(result.breakdown.gps_proximity.score).toBe(0)
    expect(result.breakdown.time_on_site.score).toBe(15)
    expect(result.breakdown.duplicate_image_check.score).toBe(15) // no submissions = no duplicates
    expect(result.breakdown.fraud_flags.score).toBe(10)
  })
})

// ─── Scenario: Missing verification photos ───────────────────────────────────

describe('Rule Engine — Missing Verification Photos', () => {
  it('penalizes heavily when 0/2 verification photos submitted', () => {
    const refPoints = [
      makeRefPoint({ id: 'p1', pointIndex: 1, isVerificationPoint: true }),
      makeRefPoint({ id: 'p2', pointIndex: 2, isVerificationPoint: true }),
      makeRefPoint({ id: 'p3', pointIndex: 3 }),
    ]

    // Worker submits after photos but skips verification
    const submissions = [
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'AFTER', locationMatchScore: 85 }),
      makeSubmission({ referencePointId: 'p3', mediaType: 'AFTER', locationMatchScore: 80 }),
    ]

    const ctx: ScoringContext = {
      task: makeTask({ timeSpentSecs: 2700 }),
      referencePoints: refPoints,
      submissions,
    }

    const result = computeTaskConfidence(ctx)

    expect(result.breakdown.verification_completeness.score).toBe(0) // 0/2 = 0 points
  })
})

// ─── Scenario: Environmental DNA bonus ───────────────────────────────────────

describe('Rule Engine — Environmental DNA Bonus', () => {
  it('adds 5 bonus points when env match > 80%', () => {
    const refPoints = [
      makeRefPoint({ id: 'p1', pointIndex: 1, isVerificationPoint: true }),
      makeRefPoint({ id: 'p2', pointIndex: 2, isVerificationPoint: true }),
      makeRefPoint({ id: 'p3', pointIndex: 3 }),
    ]

    const submissions = [
      makeSubmission({ referencePointId: 'p1', mediaType: 'VERIFICATION', locationMatchScore: 95 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'VERIFICATION', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p1', mediaType: 'AFTER', locationMatchScore: 95 }),
      makeSubmission({ referencePointId: 'p2', mediaType: 'AFTER', locationMatchScore: 90 }),
      makeSubmission({ referencePointId: 'p3', mediaType: 'AFTER', locationMatchScore: 85 }),
    ]

    const ctxWithEnv: ScoringContext = {
      task: makeTask({ timeSpentSecs: 2700 }),
      referencePoints: refPoints,
      submissions,
      environmentMatch: 92, // high match
    }

    const ctxWithoutEnv: ScoringContext = {
      task: makeTask({ timeSpentSecs: 2700 }),
      referencePoints: refPoints,
      submissions,
      environmentMatch: null,
    }

    const withEnv = computeTaskConfidence(ctxWithEnv)
    const withoutEnv = computeTaskConfidence(ctxWithoutEnv)

    expect(withEnv.breakdown.env_dna.score).toBe(5)
    expect(withoutEnv.breakdown.env_dna.score).toBe(0)
    expect(withEnv.score).toBeGreaterThan(withoutEnv.score)
  })

  it('gives 0 bonus when env match < 80% (never penalizes)', () => {
    const ctx: ScoringContext = {
      task: makeTask(),
      referencePoints: [],
      submissions: [],
      environmentMatch: 45, // low match
    }

    const result = computeTaskConfidence(ctx)
    expect(result.breakdown.env_dna.score).toBe(0) // no bonus, but no penalty
  })
})

// ─── Scenario: Motion signature bonus ────────────────────────────────────────

describe('Rule Engine — Motion Signature Bonus', () => {
  it('adds 5 bonus points when cleaning activity > 50%', () => {
    const ctx: ScoringContext = {
      task: makeTask(),
      referencePoints: [],
      submissions: [],
      motionSummary: {
        cleaningPct: 0.65,
        walkingPct: 0.20,
        standingPct: 0.10,
        vehiclePct: 0.05,
        totalWindows: 90,
        durationSecs: 2700,
      },
    }

    const result = computeTaskConfidence(ctx)
    expect(result.breakdown.motion_signature.score).toBe(5)
  })

  it('gives 0 bonus when cleaning activity < 50% (never penalizes)', () => {
    const ctx: ScoringContext = {
      task: makeTask(),
      referencePoints: [],
      submissions: [],
      motionSummary: {
        cleaningPct: 0.10,
        walkingPct: 0.05,
        standingPct: 0.80,
        vehiclePct: 0.05,
        totalWindows: 90,
        durationSecs: 2700,
      },
    }

    const result = computeTaskConfidence(ctx)
    expect(result.breakdown.motion_signature.score).toBe(0) // no penalty
  })
})

// ─── Decision thresholds ─────────────────────────────────────────────────────

describe('Rule Engine — Decision Thresholds', () => {
  it('thresholds are configured correctly', () => {
    expect(DECISION_THRESHOLDS.AUTO_PASS).toBe(85)
    expect(DECISION_THRESHOLDS.MANUAL_REVIEW).toBe(65)
  })
})
