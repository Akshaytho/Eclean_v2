// TypeScript interfaces matching the backend API responses exactly

export type Role = 'WORKER' | 'BUYER' | 'SUPERVISOR' | 'ADMIN' | 'CITIZEN'

export type TaskStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'AI_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPUTED'
  | 'CANCELLED'

export type TaskCategory =
  | 'STREET_CLEANING'
  | 'PARK_MAINTENANCE'
  | 'DRAIN_CLEANING'
  | 'GARBAGE_COLLECTION'
  | 'GRAFFITI_REMOVAL'
  | 'OTHER'

export type DirtyLevel   = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'CRITICAL'
export type TaskUrgency  = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type MediaType    = 'BEFORE' | 'AFTER' | 'PROOF' | 'REFERENCE'
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface User {
  id:    string
  email: string
  name:  string
  role:  Role
}

export interface AuthTokens {
  accessToken:  string
  refreshToken: string
  expiresIn:    number
}

export interface Task {
  id:              string
  title:           string
  description:     string
  category:        TaskCategory
  dirtyLevel:      DirtyLevel
  urgency:         TaskUrgency
  rateCents:       number
  status:          TaskStatus
  buyerId:         string
  workerId:        string | null
  locationLat:     number | null
  locationLng:     number | null
  locationAddress: string | null
  workWindowStart: string
  workWindowEnd:   string
  startedAt:       string | null
  submittedAt:     string | null
  completedAt:     string | null
  cancelledAt:     string | null
  aiScore:         number | null
  aiLabel:         string | null
  aiReasoning:     string | null
  aiRecommendation:string | null
  createdAt:       string
  updatedAt:       string
  // Populated on detail endpoints
  media?:          TaskMedia[]
  worker?:         { id: string; name: string; email: string } | null
  payout?:         Payout | null
}

export interface TaskMedia {
  id:        string
  taskId:    string
  type:      MediaType
  url:       string
  createdAt: string
}

export interface Payout {
  id:               string
  taskId:           string
  workerId:         string
  amountCents:      number
  workerAmountCents:number
  platformFeeCents: number
  status:           PayoutStatus
  paidAt:           string | null
  createdAt:        string
}

export interface Notification {
  id:        string
  userId:    string
  type:      string
  title:     string
  body:      string
  data:      Record<string, string>
  isRead:    boolean
  createdAt: string
}

export interface ChatMessage {
  id:        string
  taskId:    string
  senderId:  string
  content:   string
  timestamp: string
  from: {
    id:   string
    name: string
    role: Role
  }
}

export interface Zone {
  id:         string
  name:       string
  city:       string
  dirtyLevel: DirtyLevel
  lat:        number | null
  lng:        number | null
  radius:     number | null
}

export interface CitizenReport {
  id:          string
  reporterId:  string
  category:    TaskCategory
  description: string
  urgency:     TaskUrgency
  lat:         number
  lng:         number
  photoUrl:    string | null
  status:      'PENDING' | 'REVIEWED' | 'ASSIGNED' | 'RESOLVED'
  createdAt:   string
}

export interface WorkerProfile {
  userId:        string
  rating:        number | null
  completedTasks:number
  activeTaskId:  string | null
  totalEarnedCents: number
}

export interface WalletData {
  availableCents: number
  pendingCents:   number
  totalEarnedCents: number
}

// ─── Offline queue item ───────────────────────────────────────────────────────

export interface OfflineQueueItem {
  id:        string
  createdAt: number // Date.now()
  endpoint:  string
  method:    string
  body?:     Record<string, unknown>
  tag?:      string
  retries:   number
}

// ─── GPS ──────────────────────────────────────────────────────────────────────

export interface GPSCoord {
  lat:       number
  lng:       number
  accuracy?: number
  timestamp: number
}
