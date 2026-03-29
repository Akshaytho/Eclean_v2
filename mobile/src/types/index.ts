export type Role = 'WORKER' | 'BUYER' | 'SUPERVISOR' | 'ADMIN' | 'CITIZEN'

export type TaskStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'COMPLETED'

export type TaskCategory =
  | 'STREET_CLEANING'
  | 'PARK_CLEANING'
  | 'DRAIN_CLEANING'
  | 'GARBAGE_COLLECTION'
  | 'GRAFFITI_REMOVAL'
  | 'WATER_BODY'
  | 'PUBLIC_TOILET'
  | 'OTHER'

export type DirtyLevel  = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'CRITICAL'
export type TaskUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL'
export type MediaType   = 'BEFORE' | 'AFTER' | 'PROOF' | 'REFERENCE'
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface WorkerProfile {
  id:               string
  userId:           string
  activeTaskId:     string | null
  skills:           string[]
  rating:           number
  completedTasks:   number
  isAvailable:      boolean
  identityVerified: boolean
}

export interface BuyerProfile {
  id:               string
  userId:           string
  companyName:      string | null
  totalTasksPosted: number
  totalSpentCents:  number
}

export interface User {
  id:             string
  email:          string
  name:           string
  role:           Role
  workerProfile?: WorkerProfile | null
  buyerProfile?:  BuyerProfile  | null
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
  uploadWindowEnd: string
  timezone:        string
  startedAt:       string | null
  submittedAt:     string | null
  completedAt:     string | null
  cancelledAt:     string | null
  timeSpentSecs:   number | null
  aiScore:         number | null
  aiReasoning:     string | null
  createdAt:       string
  updatedAt:       string
  // Populated on detail endpoints
  media?:          TaskMedia[]
  worker?:         { id: string; name: string; email: string } | null
  buyer?:          { id: string; name: string; email: string } | null
  payout?:         Payout | null
  events?:         TaskEvent[]
}

export interface TaskMedia {
  id:        string
  taskId:    string
  type:      MediaType
  url:       string
  publicId:  string | null
  mimeType:  string | null
  sizeBytes: number | null
  createdAt: string
}

export interface Payout {
  id:                string
  taskId:            string
  workerId:          string
  buyerId:           string
  amountCents:       number
  workerAmountCents: number
  platformFeeCents:  number
  currency:          string
  status:            PayoutStatus
  razorpayPayoutId:  string | null
  paidAt:            string | null
  createdAt:         string
}

export interface TaskEvent {
  id:        string
  taskId:    string
  actor:     string
  actorRole: Role
  from:      TaskStatus
  to:        TaskStatus
  note:      string | null
  createdAt: string
}

export interface Notification {
  id:        string
  userId:    string
  type:      string
  title:     string
  body:      string
  data:      Record<string, unknown> | null
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
  id:             string
  name:           string
  city:           string | null
  dirtyLevel:     DirtyLevel | null
  lat:            number | null
  lng:            number | null
  radiusMeters:   number | null
  lastInspectedAt:string | null
  supervisorId:   string | null
  createdAt:      string
}

export interface CitizenReport {
  id:              string
  reporterId:      string
  zoneId:          string | null
  category:        TaskCategory
  urgency:         TaskUrgency
  locationLat:     number | null
  locationLng:     number | null
  locationAddress: string | null
  photoUrl:        string | null
  description:     string
  status:          'PENDING' | 'REPORTED' | 'REVIEWED' | 'ASSIGNED' | 'CONVERTED_TO_TASK' | 'RESOLVED' | 'REJECTED'
  linkedTaskId:    string | null
  createdAt:       string
  updatedAt:       string
}

export interface WalletData {
  pendingCents:        number
  processingCents:     number
  availableCents:      number
  totalEarnedCents:    number
  completedTasksCount: number
}

export interface BuyerWalletData {
  totalSpentCents: number
  escrowCents:     number
}

// ─── Offline queue ────────────────────────────────────────────────────────────

export interface OfflineQueueItem {
  id:        string
  createdAt: number
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
