// eClean — Category-Specific Verification Prompts
//
// This is the domain intelligence layer. Each task category has different
// success criteria, different things to look for, and different fraud patterns.
//
// A drain cleaning verification is fundamentally different from graffiti removal.
// Generic prompts miss category-specific signals. These prompts encode the
// domain knowledge that makes eClean's verification irreplaceable.
//
// PROMPT VERSIONING: Every prompt has a version string. When we A/B test
// or improve prompts, we increment the version. The version is stored in
// AiVerification.promptVersion so we can correlate accuracy with prompt changes.

import type { DirtyLevel, TaskCategory } from '@prisma/client'

export const PROMPT_VERSION = 'v2.1.0'

// ─── Category-Specific Criteria ─────────────────────────────────────────────

interface CategoryCriteria {
  /** What "clean" looks like for this category */
  successIndicators: string[]
  /** Common ways workers cheat in this category */
  fraudIndicators: string[]
  /** What to specifically look for in BEFORE photo */
  beforeChecks: string[]
  /** What to specifically look for in AFTER photo */
  afterChecks: string[]
  /** What PROOF photo should show */
  proofExpectations: string[]
  /** Category-specific scoring weight adjustments */
  weights: {
    cleanliness: number
    workEvidence: number
    completeness: number
    safety: number
    photoQuality: number
  }
}

const CATEGORY_CRITERIA: Record<TaskCategory, CategoryCriteria> = {
  STREET_CLEANING: {
    successIndicators: [
      'Visible litter and debris removed from road surface and sidewalks',
      'Gutters and curbs cleared of accumulated waste',
      'No remaining plastic bags, bottles, food waste, or paper',
      'Road markings visible after cleaning (if applicable)',
      'Drainage inlets clear of debris',
    ],
    fraudIndicators: [
      'Photos taken at different locations (background landmarks change)',
      'Litter appears placed/staged in BEFORE photo',
      'AFTER photo taken at a naturally clean area, not the same spot',
      'Time gap between photos too short for the area size',
      'Shadows indicate photos taken at very different times of day',
    ],
    beforeChecks: [
      'Litter distribution should look natural, not staged',
      'Street identifiable by landmarks, signs, or buildings',
      'Scale of mess should match the reported dirty level',
    ],
    afterChecks: [
      'Same location as BEFORE (match landmarks, buildings, road features)',
      'Road surface and walkway visibly cleaner',
      'No obvious remaining litter in frame',
    ],
    proofExpectations: [
      'Worker or cleaning equipment visible',
      'Collected waste bags or cleaning vehicle',
      'Action shot showing cleaning in progress',
    ],
    weights: { cleanliness: 0.35, workEvidence: 0.25, completeness: 0.20, safety: 0.05, photoQuality: 0.15 },
  },

  PARK_CLEANING: {
    successIndicators: [
      'Walking paths cleared of litter and leaves',
      'Grass areas free of trash',
      'Trash bins emptied or replaced',
      'Benches and play equipment clean',
      'Flower beds and garden areas maintained',
    ],
    fraudIndicators: [
      'Photos from different parks (different vegetation, layout)',
      'AFTER photo shows a naturally maintained area, not one that was just cleaned',
      'Trash bins still full in AFTER photo',
      'Leaves and natural debris confused with actual litter in BEFORE',
    ],
    beforeChecks: [
      'Park identifiable by layout, equipment, or signage',
      'Trash visible in paths, grass, or around bins',
      'Natural debris (leaves, branches) vs actual litter distinction',
    ],
    afterChecks: [
      'Same park section visible',
      'Paths and grass areas visibly cleaner',
      'Bins not overflowing',
    ],
    proofExpectations: [
      'Worker with rake, broom, or trash bags in park',
      'Filled trash bags ready for collection',
      'Before/after of specific dirty spots (e.g., around bench)',
    ],
    weights: { cleanliness: 0.30, workEvidence: 0.25, completeness: 0.25, safety: 0.05, photoQuality: 0.15 },
  },

  DRAIN_CLEANING: {
    successIndicators: [
      'Water flowing freely through drain after cleaning',
      'Blockage material removed and visible in waste pile',
      'Drain grate/cover cleaned and repositioned',
      'Surrounding area cleared of overflow debris',
      'No standing water remaining',
    ],
    fraudIndicators: [
      'AFTER photo shows a different drain entirely',
      'Blockage material not visible (where did it go?)',
      'Drain still has standing water in AFTER photo',
      'No tools or equipment visible anywhere',
      'BEFORE photo shows an already clean drain',
    ],
    beforeChecks: [
      'Drain location identifiable (street, building, marker)',
      'Blockage or standing water visible',
      'Severity matches reported dirty level',
    ],
    afterChecks: [
      'Same drain (match surroundings, grate pattern)',
      'Water flow visible or drain clearly unblocked',
      'Surrounding area cleaned of overflow',
    ],
    proofExpectations: [
      'Worker with drain cleaning tools (rod, scoop, gloves)',
      'Removed blockage material piled nearby',
      'Water flow test — water running through cleared drain',
    ],
    weights: { cleanliness: 0.25, workEvidence: 0.30, completeness: 0.25, safety: 0.10, photoQuality: 0.10 },
  },

  GARBAGE_COLLECTION: {
    successIndicators: [
      'All accumulated garbage bags/piles removed',
      'Area swept clean after collection',
      'No scattered waste remaining around collection point',
      'Bin area organized if collection point has bins',
      'No liquid residue or stains from waste',
    ],
    fraudIndicators: [
      'Garbage visible in AFTER photo but different arrangement',
      'BEFORE photo appears staged with small amount of waste',
      'Different collection point in AFTER vs BEFORE',
      'No vehicle or transport visible for large collections',
    ],
    beforeChecks: [
      'Collection point identifiable',
      'Volume of garbage matches dirty level',
      'Type of waste visible (household, commercial, mixed)',
    ],
    afterChecks: [
      'Same collection point (match walls, bins, ground markings)',
      'Area clear of all waste',
      'Ground swept (no scattered items)',
    ],
    proofExpectations: [
      'Worker loading waste onto vehicle or cart',
      'Filled collection bags or bin',
      'Transport vehicle with collected waste',
    ],
    weights: { cleanliness: 0.30, workEvidence: 0.30, completeness: 0.25, safety: 0.05, photoQuality: 0.10 },
  },

  GRAFFITI_REMOVAL: {
    successIndicators: [
      'Graffiti completely removed or covered',
      'Wall/surface restored to original color',
      'No paint residue or ghost marks remaining',
      'Surrounding surface not damaged by removal process',
      'Paint or solvent cleanup complete',
    ],
    fraudIndicators: [
      'BEFORE photo shows different wall/surface than AFTER',
      'Graffiti appears to be digitally added in BEFORE photo',
      'AFTER photo shows a naturally clean wall, not a cleaned one',
      'No cleaning supplies or paint visible',
      'Surface texture different between photos (different wall)',
    ],
    beforeChecks: [
      'Wall/surface identifiable by surrounding context',
      'Graffiti clearly visible with detail',
      'Surface material identifiable (brick, concrete, metal, etc.)',
    ],
    afterChecks: [
      'Same surface (match surrounding features, building, texture)',
      'Graffiti removed or fully covered with matching paint',
      'No dripping paint or visible patch marks',
    ],
    proofExpectations: [
      'Worker with removal tools (power washer, paint roller, solvent)',
      'Chemical/solvent containers or paint cans visible',
      'Close-up of cleaned area showing work quality',
    ],
    weights: { cleanliness: 0.35, workEvidence: 0.25, completeness: 0.25, safety: 0.05, photoQuality: 0.10 },
  },

  WATER_BODY: {
    successIndicators: [
      'Floating debris and plastic removed from water surface',
      'Water clarity improved (if applicable)',
      'Banks/shores cleaned of litter',
      'No oil sheen or chemical discharge visible',
      'Natural vegetation cleared of tangled waste',
    ],
    fraudIndicators: [
      'Photos show different water bodies (different shoreline shape)',
      'Water clarity change too dramatic for manual cleaning',
      'No collection equipment or boats visible',
      'BEFORE photo shows water that is clean in parts but framed to look dirty',
    ],
    beforeChecks: [
      'Water body identifiable (bridge, shore features, buildings)',
      'Pollution type visible (plastic, organic, industrial)',
      'Scale of contamination matches dirty level',
    ],
    afterChecks: [
      'Same water body (match shoreline, landmarks)',
      'Surface cleaner — less floating debris',
      'Banks cleaned',
    ],
    proofExpectations: [
      'Worker on shore or in boat with collection tools',
      'Bags of collected floating debris',
      'Net or scoop in use',
    ],
    weights: { cleanliness: 0.25, workEvidence: 0.30, completeness: 0.20, safety: 0.15, photoQuality: 0.10 },
  },

  PUBLIC_TOILET: {
    successIndicators: [
      'Floors mopped and visibly clean',
      'Toilet bowls/urinals scrubbed and white',
      'Sinks and mirrors cleaned',
      'Soap/sanitizer dispensers filled',
      'Trash bins emptied and lined',
      'No foul odor indicators (wet floor after mopping = good sign)',
    ],
    fraudIndicators: [
      'Photos from different toilet facilities',
      'AFTER photo shows a newly constructed toilet, not a cleaned one',
      'Cleaning supplies brand new/unused (props not used tools)',
      'No wet surfaces in AFTER (mopping leaves visible dampness)',
    ],
    beforeChecks: [
      'Facility identifiable (door number, external features)',
      'Current state of uncleanliness visible',
      'Fixtures visible (toilet, sink, mirror)',
    ],
    afterChecks: [
      'Same facility (match fixtures, tile pattern, layout)',
      'Floors wet from mopping (expected after cleaning)',
      'Fixtures visibly scrubbed',
      'Supplies restocked if applicable',
    ],
    proofExpectations: [
      'Worker with mop, scrub brush, or cleaning chemicals',
      'Cleaning supplies and equipment visible',
      'Mid-cleaning shot showing scrubbing or mopping action',
    ],
    weights: { cleanliness: 0.35, workEvidence: 0.20, completeness: 0.25, safety: 0.10, photoQuality: 0.10 },
  },

  OTHER: {
    successIndicators: [
      'Visible improvement between BEFORE and AFTER photos',
      'Task description requirements addressed',
      'Area noticeably cleaner or improved',
    ],
    fraudIndicators: [
      'Photos appear to be from different locations',
      'No visible improvement between BEFORE and AFTER',
      'Time gap inconsistent with task complexity',
    ],
    beforeChecks: [
      'Location identifiable',
      'Current state matches task description',
    ],
    afterChecks: [
      'Same location as BEFORE',
      'Visible improvement in targeted area',
    ],
    proofExpectations: [
      'Worker or tools visible',
      'Evidence of work performed',
    ],
    weights: { cleanliness: 0.30, workEvidence: 0.25, completeness: 0.25, safety: 0.05, photoQuality: 0.15 },
  },
}

// ─── Dirty Level Context ────────────────────────────────────────────────────

const DIRTY_LEVEL_CONTEXT: Record<DirtyLevel, string> = {
  LIGHT: 'The task area was lightly soiled — minor litter, dust, or small messes. A quick cleanup should be sufficient. Expect modest but clear improvement.',
  MEDIUM: 'The task area had moderate dirtiness — noticeable waste accumulation requiring 30-60 minutes of work. Expect significant visible improvement.',
  HEAVY: 'The task area was heavily soiled — substantial waste, potentially requiring special equipment or multiple trips. Expect dramatic transformation but some residual marks may remain.',
  CRITICAL: 'The task area was in critical condition — severe contamination, hazardous waste, or long-neglected filth. Even excellent work may show some remaining marks. Judge improvement relative to severity.',
}

// ─── Scoring Weight Explanation ─────────────────────────────────────────────

const DIMENSION_DESCRIPTIONS = {
  cleanliness: 'How much cleaner the area is in the AFTER photo compared to BEFORE. The core measure of task success.',
  workEvidence: 'Signs that actual cleaning work was performed — tools visible, worker present, collected waste shown, wet surfaces from mopping.',
  completeness: 'Whether ALL areas mentioned in the task description were addressed, not just the easy/visible parts.',
  safety: 'Worker wearing appropriate PPE (gloves, boots, mask if chemicals), no new hazards created, chemicals handled properly.',
  photoQuality: 'Photos are clear, well-lit, properly framed to show the work area. Not blurry, dark, too close, or too far.',
}

// ─── Build the verification prompt ──────────────────────────────────────────

export interface PromptContext {
  taskDescription: string
  category: TaskCategory
  dirtyLevel: DirtyLevel
  workerTrustTier?: string
  fraudSignals?: string[]   // pre-computed fraud signals to consider
  attemptNumber?: number
  previousReasoning?: string // if re-submission, what was wrong last time
}

export function buildVerificationPrompt(ctx: PromptContext): string {
  const criteria = CATEGORY_CRITERIA[ctx.category]
  const dirtyContext = DIRTY_LEVEL_CONTEXT[ctx.dirtyLevel]
  const weights = criteria.weights

  const sections: string[] = []

  // System role
  sections.push(
    `You are eClean's AI Verification Engine — a production system that verifies civic cleaning work. ` +
    `Your verification determines whether a worker gets paid. Be ACCURATE and FAIR. ` +
    `False approvals waste buyer money. False rejections deny workers their earnings. Both damage trust.`,
  )

  // Task context
  sections.push(
    `\n## TASK CONTEXT`,
    `- Description: ${ctx.taskDescription}`,
    `- Category: ${ctx.category.replace(/_/g, ' ')}`,
    `- Dirty Level: ${ctx.dirtyLevel}`,
    `- ${dirtyContext}`,
  )

  if (ctx.attemptNumber && ctx.attemptNumber > 1) {
    sections.push(
      `- This is attempt #${ctx.attemptNumber} (worker re-submitted after previous rejection)`,
    )
    if (ctx.previousReasoning) {
      sections.push(`- Previous rejection reason: ${ctx.previousReasoning}`)
    }
  }

  // Photo instructions
  sections.push(
    `\n## PHOTOS PROVIDED`,
    `Image 1 = BEFORE photo (state before cleaning started)`,
    `Image 2 = AFTER photo (state after cleaning completed)`,
    `Image 3 = PROOF photo (evidence of worker performing the task)`,
  )

  // Category-specific criteria
  sections.push(
    `\n## SUCCESS CRITERIA FOR ${ctx.category.replace(/_/g, ' ')}`,
    `What GOOD work looks like:`,
    ...criteria.successIndicators.map((s, i) => `${i + 1}. ${s}`),
  )

  sections.push(
    `\nBEFORE photo should show:`,
    ...criteria.beforeChecks.map(s => `- ${s}`),
    `\nAFTER photo should show:`,
    ...criteria.afterChecks.map(s => `- ${s}`),
    `\nPROOF photo should show:`,
    ...criteria.proofExpectations.map(s => `- ${s}`),
  )

  // Fraud awareness
  sections.push(
    `\n## FRAUD INDICATORS TO CHECK`,
    `Common fraud patterns for this category:`,
    ...criteria.fraudIndicators.map(s => `- ${s}`),
  )

  if (ctx.fraudSignals && ctx.fraudSignals.length > 0) {
    sections.push(
      `\n⚠️ PRE-COMPUTED FRAUD SIGNALS DETECTED:`,
      ...ctx.fraudSignals.map(s => `- ${s}`),
      `Factor these signals into your suspiciousActivity assessment.`,
    )
  }

  // Worker trust context
  if (ctx.workerTrustTier) {
    const tierContext: Record<string, string> = {
      NEW: 'This is a NEW worker with limited history. Apply standard verification — neither lenient nor strict.',
      BUILDING: 'This worker is BUILDING trust — has some completed tasks. Apply standard verification.',
      TRUSTED: 'This worker has TRUSTED status with consistently high scores. Minor imperfections are acceptable if overall quality is clear.',
      EXPERT: 'This worker is an EXPERT with exceptional track record. Focus on major issues only — they have earned benefit of the doubt.',
      FLAGGED: 'This worker has been FLAGGED for past issues. Apply STRICT verification — look carefully at all fraud indicators.',
    }
    sections.push(
      `\n## WORKER CONTEXT`,
      tierContext[ctx.workerTrustTier] ?? 'Apply standard verification.',
    )
  }

  // Scoring instructions
  sections.push(
    `\n## SCORING INSTRUCTIONS`,
    `Score each dimension from 0.0 to 1.0:`,
    ``,
    `1. cleanlinessScore (weight: ${(weights.cleanliness * 100).toFixed(0)}%) — ${DIMENSION_DESCRIPTIONS.cleanliness}`,
    `2. workEvidenceScore (weight: ${(weights.workEvidence * 100).toFixed(0)}%) — ${DIMENSION_DESCRIPTIONS.workEvidence}`,
    `3. completenessScore (weight: ${(weights.completeness * 100).toFixed(0)}%) — ${DIMENSION_DESCRIPTIONS.completeness}`,
    `4. safetyScore (weight: ${(weights.safety * 100).toFixed(0)}%) — ${DIMENSION_DESCRIPTIONS.safety}`,
    `5. photoQualityScore (weight: ${(weights.photoQuality * 100).toFixed(0)}%) — ${DIMENSION_DESCRIPTIONS.photoQuality}`,
    ``,
    `Also assess:`,
    `- workEvident (boolean): Can you clearly see that cleaning work was actually performed?`,
    `- suspiciousActivity (boolean): Any fraud indicators detected?`,
    `- locationConsistent (boolean): Do all three photos appear to be from the same location?`,
  )

  // Output format
  sections.push(
    `\n## RESPONSE FORMAT`,
    `Return ONLY valid JSON with no other text. Structure:`,
    `{`,
    `  "cleanlinessScore": 0.0-1.0,`,
    `  "workEvidenceScore": 0.0-1.0,`,
    `  "completenessScore": 0.0-1.0,`,
    `  "safetyScore": 0.0-1.0,`,
    `  "photoQualityScore": 0.0-1.0,`,
    `  "workEvident": true/false,`,
    `  "suspiciousActivity": true/false,`,
    `  "locationConsistent": true/false,`,
    `  "reasoning": "2-3 sentence explanation of your assessment",`,
    `  "categoryNotes": "category-specific observations",`,
    `  "improvementSuggestions": "what worker could improve (null if EXCELLENT)"`,
    `}`,
  )

  return sections.join('\n')
}

// ─── Exports for scoring engine ─────────────────────────────────────────────

export function getCategoryWeights(category: TaskCategory) {
  return CATEGORY_CRITERIA[category].weights
}

export function getCategoryCriteria(category: TaskCategory) {
  return CATEGORY_CRITERIA[category]
}
