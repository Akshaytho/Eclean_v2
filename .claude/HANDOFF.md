# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.
> **RULE: Never delete previous session entries. Append new sessions below with date.**

---

## Session 9 — 2026-04-01 (AI Model Testing + Prompt Engineering + Bug Fixes)

### Status: gpt-5 deployed with reasoning prompt, all backend TS errors fixed, UI improvements from user testing

### What was completed:

**AI Model Comparison (real test — toilet cleaning task):**
- gpt-4o (old prompt): 0.85 APPROVE — just saw "looks cleaner"
- gpt-5.1 (old prompt): 0.85 APPROVE — same, no reasoning about time
- gpt-5.1 (reasoning prompt): 0.30 REJECT — "stains remain, no mop marks"
- gpt-5 (reasoning prompt): 0.20 REJECT — strictest, cheapest, "4 min for CRITICAL = physically unlikely"
- **Winner: gpt-5 + reasoning prompt** — ₹0.96/task, catches incomplete work

**Prompt Engineering Breakthrough:**
- Old prompt: "Is area cleaner?" → AI only compared visuals
- New prompt: "Think step by step — is X minutes realistic for CRITICAL [category]?" 
- Added TIME vs DIFFICULTY check (4 min for CRITICAL toilet = impossible)
- Added REMAINING DIRT check (stains still visible = incomplete)
- Added "could photos be taken without actually cleaning?"
- Same model, same photos — prompt made 0.85 → 0.20 difference

**Backend Fixes:**
- `max_tokens` → `max_completion_tokens` (required by gpt-4.1+, gpt-5+)
- All TypeScript errors fixed (NotificationType enums, GPS trail timestamp→createdAt)
- Backend deployed and healthy on Railway
- expo-linking dependency installed for mobile deep linking

**User Testing Improvements (from file modifications):**
- PostSubmissionScreen: AI timeout fallback (10 min), verified/info icons, better step labels
- FindWorkScreen: query disabled without GPS (prevents fetching ALL tasks globally)
- TaskDetailScreen: status-aware footer (REJECTED→retry, SUBMITTED→awaiting, APPROVED→completed)
- ReportIssueScreen: photo evidence uploaded to server before cancel, "task returned to open"
- ReferencePointNavigator: single upload for AFTER+VERIFICATION (backend auto-creates both)
- WorkerHomeScreen: online/offline toggle, "Paid to bank" label, paidOutCents field
- worker-submission.service: AFTER upload on verification point auto-creates VERIFICATION record
- CaptureCamera: reverted to real file hash (SHA-256 of base64) for tamper detection
- app.json: added scheme "eclean" for deep linking, CORS origins from env
- payment-release.job: full payout creation with platform fee, uses notifyUser helper

### Production State:
- Railway deployed with gpt-5 + reasoning prompt
- AI model: gpt-5 (default, ₹0.96/task)
- Debug endpoint `/debug/reverify` still active (remove before launch)
- All changes pushed to `image_capture_workflow` branch

### Key Decisions:
1. gpt-5 over gpt-5.1 — stricter (0.20 vs 0.30) AND cheaper ($1.25 vs $2.50/1M input)
2. Prompt engineering > model selection — reasoning prompt was the real breakthrough
3. `max_completion_tokens` required for all models gpt-4.1 and newer
4. Single upload for verification points — backend creates both AFTER + VERIFICATION records

### Branch: image_capture_workflow
### Latest commit: d881d3f

---

## Session 10 — 2026-04-02 (Admin Portal — Separate Repo Created)

### Status: Admin portal fully built in separate repo, 10 pages, compiles clean, connected to Railway DB

### What was completed:

**New Repo Created: `/Users/thotaakshay/eclean-admin/`**
- Completely separate from Eclean_v2 — own backend logic via Next.js
- Connects directly to same Railway PostgreSQL (no API hop to main backend)
- Zero coupling to Fastify backend

**Tech Stack:**
- Next.js 16 (App Router) + shadcn/ui + Tailwind CSS
- Prisma 6 (same schema as backend, reads same DB)
- Recharts (revenue + task activity charts)
- lucide-react (icons)
- jose (JWT verification)
- bcryptjs (password comparison)

**Architecture Decision:**
- Admin portal is a full-stack Next.js app (server components = admin backend)
- NOT a SPA calling main backend APIs
- Reads DB directly via Prisma — faster, no main backend dependency
- Auth: own JWT session in httpOnly cookie, middleware protects all routes
- Only ADMIN role users can access

**10 Pages Built:**

| Page | Route | Features |
|------|-------|----------|
| Login | `/login` | Email/password, ADMIN-only, JWT httpOnly cookie |
| Dashboard | `/dashboard` | 8 metric cards, revenue chart, task activity chart, recent tasks table |
| Users | `/users` | Search, filter by role, paginated, activate/deactivate, verify worker identity |
| Disputes | `/disputes` | Expandable cards, buyer vs worker photos side-by-side, AI scores + reasoning, event timeline, approve/reject with notes |
| Leaderboard | `/leaderboard` | Day/week/month toggle, tasks completed, earnings, AI scores, trust, distance |
| Payouts | `/payouts` | Status breakdown (pending/processing/completed/failed), fee tracking |
| Reports | `/reports` | Citizen reports with urgency, category, zone, status |
| Zones | `/zones` | Zone cards with dirty scores, task counts, worker counts, inspection dates |
| Analytics | `/analytics` | AI score averages, flagged photos, supply/demand, charts |
| API Keys | `/api-keys` | B2B data customer keys, permissions, rate limit tiers, usage |

**API Routes (admin backend):**
- `POST /api/auth/login` — admin login
- `GET /api/auth/me` — session check
- `POST /api/auth/logout` — destroy session
- `PATCH /api/admin/users` — activate/deactivate/verify
- `POST /api/admin/disputes` — resolve dispute (approve/reject + payout creation)

**Files Structure:**
```
eclean-admin/
├── prisma/schema.prisma          ← same schema as backend
├── src/
│   ├── app/
│   │   ├── (auth)/login/         ← login page
│   │   ├── (dashboard)/          ← all admin pages (protected by layout)
│   │   │   ├── dashboard/
│   │   │   ├── users/
│   │   │   ├── disputes/
│   │   │   ├── leaderboard/
│   │   │   ├── payouts/
│   │   │   ├── reports/
│   │   │   ├── zones/
│   │   │   ├── analytics/
│   │   │   └── api-keys/
│   │   └── api/                  ← admin backend (mutations)
│   ├── components/
│   │   ├── dashboard/            ← sidebar, header, stat-card, charts, tables
│   │   └── ui/                   ← shadcn components
│   ├── lib/
│   │   ├── auth.ts               ← JWT session management
│   │   ├── prisma.ts             ← Prisma client singleton
│   │   └── utils.ts              ← cn() helper
│   ├── services/
│   │   ├── dashboard.ts          ← getDashboardStats()
│   │   ├── users.ts              ← getUsers(), toggleUserActive(), verifyWorkerIdentity()
│   │   ├── disputes.ts           ← getDisputes(), resolveDispute()
│   │   └── leaderboard.ts        ← getWorkerLeaderboard()
│   └── middleware.ts             ← auth guard (ADMIN role check)
├── .env.local                    ← DATABASE_URL + JWT_ACCESS_SECRET (gitignored)
├── .env.example                  ← template for env vars
└── package.json
```

**Environment:**
- `.env.local` configured with Railway PostgreSQL public proxy + JWT_ACCESS_SECRET
- DB: `yamanote.proxy.rlwy.net:31983`
- Dev server: `npm run dev -- --port 3001 --webpack` (Turbopack has platform issue on darwin/x64)
- Login: `admin@eclean.test` / `Test@1234`

**Known Issues:**
- First page load in dev mode is slow (~30s) because webpack compiles on demand
- Next.js 16 deprecated `middleware.ts` → `proxy.ts` (still works with warning)
- Turbopack doesn't work on this Mac (darwin/x64) — must use `--webpack` flag
- Consider downgrading to Next.js 15 for stable Turbopack, or just deploy to Vercel

### What needs to happen next (Priority Order):

**Priority 1 — Deploy + Fix Dev Experience:**
- Deploy to Vercel (free tier) — eliminates compilation lag, instant loads
- OR downgrade to Next.js 15 for Turbopack support on this platform
- Test all 10 pages with real production data

**Priority 2 — Missing Features:**
- Task detail view (click task → full details + photos + GPS trail) — MOST IMPORTANT
- API key creation form (currently read-only)
- Convert citizen report → task button (on reports page)
- Auto-refresh dashboard every 30s
- Zone health map with MapLibre GL

**Priority 3 — Backend Separation:**
- Remove admin routes from main backend (`src/modules/admin/`, `src/intelligence/analytics/`, `src/intelligence/data-export/`)
- Remove their registrations from `app.ts`
- Main backend becomes mobile-only — lighter + faster

**Priority 4 — Data Monetization UI:**
- API key creation wizard with permissions selector
- Usage analytics per API key
- Waste pattern heatmap (hour-of-day × zone)
- Cleanliness index export preview

### Branch: main (eclean-admin repo)
### Latest commit: 17b04bc

---

## Session 11 — 2026-04-02 (Full Security Audit + Load Testing + Performance Hardening)

### Status: 49 fixes across 24 files — security, concurrency, performance

### What was completed:

**Phase 1 — CRITICAL money-at-risk fixes (5 fixes):**
- Deleted unauthenticated `/debug/reverify` endpoint (was live in prod!)
- Payment amount mismatch: verify Razorpay order amount === task rateCents
- Webhook signature: always require secret, never skip regardless of NODE_ENV
- Geofence bypass: lat/lng now REQUIRED in startTaskSchema (was optional)
- Double refund: refundedAt flag set atomically inside tx, Razorpay call outside

**Phase 2 — Serious exploit fixes (7 fixes):**
- Removed BUYER from IN_PROGRESS→CANCELLED (prevents free labor theft)
- Minimum time enforcement before submit (5/10/15/20 min by dirty level)
- Authenticated logout with rate limiting
- Refresh token rate limited (30/min)
- Auto-release blocked for MANUAL_REVIEW with AI score < 0.50
- Server-side SHA-256 hash recomputation on photo uploads
- Duplicate payout already protected by @unique on Payout.taskId

**Phase 3 — Hardening (8 fixes):**
- Chat XSS: strip HTML tags, 2000 char limit
- Account lockout: 5 failed logins = 15min cooldown (Redis, graceful degradation)
- Media cleanup on worker cancel + task expiry (prevents piggyback fraud)
- Dispute auto-resolution after 7 days (based on AI + rule engine scores)
- Rating dedup: atomic conditional update prevents double-tap
- Environmental DNA wired into worker start flow (magnetometer/barometer/light/cell)
- EXIF extraction already implemented in lib/exif.ts (confirmed OK)

**Phase 4 — Pre-launch (4 fixes):**
- CI seed endpoint blocked in production
- Email verification required for write operations (not reads)
- Console.warn stripped in production builds (babel plugin)
- CORS: always use explicit origins, no wildcard

**QA Testing — Self-introduced bugs caught and fixed (11 fixes):**
- Redis down no longer crashes login (try/catch with graceful degradation)
- Logout no longer requires valid access token (was deadlock)
- Email verify only on writes, not reads (existing users not locked out)
- Lockout counter cleared AFTER isActive check
- Refund moved outside serializable tx (was causing deadlocks)
- Task expiry cleanup wrapped in transaction (was race condition)
- Rate task: atomic conditional update (was double-tap race)
- babel-plugin-transform-remove-console added to devDependencies
- timeSpentSecs null now throws error instead of skipping check
- API client type for start task made required (matches backend)
- Buyer cancel IN_PROGRESS: user-friendly error message

**Load Testing — Concurrency fixes (6 fixes):**
- Prisma connection pool: 5 → 20 (was catastrophically low)
- Upload concurrency limiter: max 10 simultaneous (50 uploads = OOM crash)
- Accept task: optimistic locking replaces serializable tx (50 workers → 1 winner + 49 instant fail, no retry storm)
- Serializable retry: 3→5 retries with exponential backoff + jitter
- Global rate limiting: 100/min per user on all endpoints
- GPS auth check cached in Redis (30s TTL, invalidated on status change)
- AI verify concurrency: 1 → 3 parallel

**Database Performance — Missing indexes (7 indexes):**
- TaskMedia: `[taskId]`, `[taskId, type]`
- TaskLocationLog: `[taskId, workerId]`, `[workerId, createdAt]`
- Payout: `[workerId, status]`, `[status]`
- CitizenReport: `[reporterId]`, `[zoneId, createdAt]`, `[status]`, `[linkedTaskId]`
- ChatMessage: `[taskId, createdAt]`
- Task expiry: select only needed fields (skip aiReasoning, etc.)

### Schema changes (require migration before deploy):
```bash
cd backend && npx prisma migrate dev --name security-audit-session-11
```
New fields: `Task.refundedAt`, `Task.ratedAt`, `Task.buyerRating`, `AnalyticsPhotoMeta.serverPhotoHash`, `AnalyticsPhotoMeta.photoHashMatch`

### Mobile dependency to install:
```bash
cd mobile && npm install
```

### Full report: `SECURITY_AUDIT.md` in repo root

### Branch: imagecapture-bug-fixes
### Files changed: 24 (23 modified + 1 new)
