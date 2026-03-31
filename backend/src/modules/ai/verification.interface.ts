/**
 * AI Verification Interface — Provider-agnostic contract
 *
 * Abstracts: API call, image preprocessing, prompt format
 * Swap providers (OpenAI, Anthropic, custom model) by implementing this interface
 */

export interface VerificationImage {
  url: string          // Cloudinary URL
  role: 'reference' | 'after'  // buyer's reference or worker's after
  pointIndex: number
  label?: string | null
  gpsScore?: number | null
}

export interface VerificationMetadata {
  taskTitle: string
  taskDescription: string
  taskCategory: string
  dirtyLevel: string
  timeSpentSecs: number | null
  totalReferencePoints: number
  totalSubmissions: number
  gpsScores: number[]
  motionData: { cleaningPct: number; standingPct: number; vehiclePct: number } | null
  envMatchScores: number[]
  zoneDirtyScore: number | null
}

export interface VerificationResult {
  verification: {
    score: number          // 0-1
    label: string          // EXCELLENT | GOOD | UNCERTAIN | POOR
    reasoning: string
    workEvident: boolean
    suspiciousActivity: boolean
    recommendation: string // APPROVE | REVIEW | REJECT
  }
  fraud: {
    probability: number    // 0-1
    anomalies: Array<{ type: string; description: string; severity: string }>
    recommendation: string // PASS | FLAG | REJECT
  }
}

export interface AIVerificationProvider {
  name: string
  verify(images: VerificationImage[], metadata: VerificationMetadata): Promise<VerificationResult>
}
