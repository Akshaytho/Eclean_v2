# eClean v2 — Claude Code Master Instructions

> **This file is read by Claude at the start of EVERY session. Keep it updated.**
> **Last updated:** [AUTO-UPDATE ON EVERY SESSION END]

---

## 1. WHAT IS eCLEAN

eClean is an AI-powered civic work verification platform.
Workers clean public areas → upload before/after photos → Claude Vision AI verifies → payment auto-releases.
Think Uber for civic sanitation work. The driver is the worker. The rider is the buyer. GPS tracking and AI scoring replace the rating system.

**5 roles:** WORKER · BUYER · SUPERVISOR · ADMIN · CITIZEN

**This repo has 2 codebases:**
- `backend/` — Fastify + Prisma + PostgreSQL + Redis + BullMQ + Claude Vision + Cloudinary + Razorpay + Socket.io (COMPLETE, PRODUCTION-READY)
- `mobile/` — React Native + Expo SDK 54 (BEING REBUILT FROM SCRATCH)

The web admin frontend is in a separate repo. Do NOT create any web frontend code here.

---

## 2. MANDATORY SESSION PROTOCOL

### Every Session START (do ALL of these before writing any code):

```
STEP 1 — Read this file (CLAUDE.md)
STEP 2 — Read .claude/HANDOFF.md (what was done last session, what's next)
STEP 3 — Read .claude/SPRINTS.md (full sprint plan with checkboxes)
STEP 4 — Tell the user: what sprint we're in, what's done, what's next
STEP 5 — WAIT for user confirmation before writing any code
```

### Every Session END (do ALL of these before closing):

```
STEP 1 — Update .claude/HANDOFF.md with:
  - What was completed this session
  - What is NOT yet done
  - Any bugs or blockers found
  - Next steps for next session
STEP 2 — Update .claude/SPRINTS.md checkboxes (mark completed items)
STEP 3 — If any backend files were changed, run: cd backend && npm test
STEP 4 — git add specific files only (NEVER git add . or git add -A)
STEP 5 — git commit with descriptive message
STEP 6 — Report to user: what was done, tests pass/fail, what's next
```

---

## 3. PRODUCTION RULES — NEVER BREAK THESE

| # | Rule | Why |
|---|------|-----|
| 1 | Never `git add .` — stage specific files only | Prevents committing secrets or junk |
| 2 | Never hardcode secrets — all via `process.env` or Expo constants | Security |
| 3 | Money is always integer paise — never floats | Financial accuracy |
| 4 | Every payment uses `prisma.$transaction()` | Prevents partial financial writes |
| 5 | All routes have Zod validation | No unvalidated input reaches business logic |
| 6 | Protected routes use `authenticate` middleware | Never manually decode JWT |
| 7 | Never expose `passwordHash` in API responses | Security |
| 8 | BullMQ jobs are idempotent — safe to re-run | Reliability |
| 9 | Tokens in SecureStore on mobile — NEVER AsyncStorage | Encrypted storage |
| 10 | GPS via Socket.io emit, NOT HTTP POST | Real-time for buyer tracking |
| 11 | Background location via expo-task-manager | Must work when phone locked |
| 12 | HANDOFF.md updated before EVERY session close | Continuity between sessions |

---

## 4. TECH STACK

### Backend (COMPLETE — do not rewrite)

| Layer | Technology |
|-------|-----------|
| HTTP API | Fastify 4 |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Queue | Redis 7 + BullMQ |
| File Storage | Cloudinary |
| AI Vision | Anthropic Claude Vision |
| Payments | Razorpay (India) |
| Real-time | Socket.io |
| Push | Expo Push API (being changed from Firebase) |
| Email | Resend |
| Auth | JWT + bcrypt + Redis blacklist |

### Mobile (BEING REBUILT)

| Layer | Technology | Why This Choice |
|-------|-----------|-----------------|
| Framework | React Native + Expo SDK 54 | Cross-platform, managed native modules |
| Navigation | @react-navigation v7 (native-stack + bottom-tabs) | Native transitions, industry standard |
| Server State | @tanstack/react-query v5 + persist-client | Caching, background refetch, offline persistence |
| Client State | Zustand v5 | Lightweight, no boilerplate |
| Maps | react-native-maps | Google Maps Android, Apple Maps iOS, free, native |
| Real-time | socket.io-client | Matches backend Socket.io |
| HTTP | Axios | Interceptors for token refresh |
| Location | expo-location + expo-task-manager | Background GPS tracking |
| Camera | expo-camera + expo-image-picker | Photo capture |
| Notifications | expo-notifications | With Expo Push API on backend |
| Secure Storage | expo-secure-store | Encrypted tokens |
| Animations | react-native-reanimated | 60fps native animations |
| Gestures | react-native-gesture-handler | Swipe, long press |
| Bottom Sheets | @gorhom/bottom-sheet | Uber/Maps-style contextual UI |
| Icons | lucide-react-native | Consistent icon set |

---

## 5. BACKEND API REFERENCE (for mobile dev)

### Auth
```
POST /api/v1/auth/register        — { email, password, name, role }
POST /api/v1/auth/login           — { email, password }
POST /api/v1/auth/refresh         — { refreshToken } (body-based for mobile)
POST /api/v1/auth/logout          — (requires auth)
GET  /api/v1/auth/me              — (requires auth) returns user + profile
POST /api/v1/auth/forgot-password — { email }
POST /api/v1/auth/reset-password  — { token, password }
```

### Buyer Tasks
```
POST /api/v1/buyer/tasks                    — create task
GET  /api/v1/buyer/tasks?status=&page=&limit= — list buyer tasks
GET  /api/v1/buyer/tasks/:taskId            — detail with media, logs, events
POST /api/v1/buyer/tasks/:taskId/approve    — approve + create payout
POST /api/v1/buyer/tasks/:taskId/reject     — { reason } reject
POST /api/v1/buyer/tasks/:taskId/cancel     — { reason } cancel
POST /api/v1/buyer/tasks/:taskId/rate       — { rating: 1-5 }
GET  /api/v1/buyer/tasks/:taskId/chat       — chat history
```

### Worker Tasks
```
GET  /api/v1/worker/tasks/open?category=&urgency=&lat=&lng=&radiusKm=&page=&limit=
GET  /api/v1/worker/tasks/:taskId
GET  /api/v1/worker/my-tasks?status=&page=&limit=
POST /api/v1/worker/tasks/:taskId/accept
POST /api/v1/worker/tasks/:taskId/start     — { lat, lng } for geofence
POST /api/v1/worker/tasks/:taskId/submit
POST /api/v1/worker/tasks/:taskId/cancel    — { reason }
POST /api/v1/worker/tasks/:taskId/retry
POST /api/v1/worker/tasks/:taskId/dispute   — { reason }
POST /api/v1/worker/tasks/:taskId/location  — { lat, lng, accuracy }
GET  /api/v1/worker/tasks/:taskId/chat      — chat history
```

### Media
```
POST /api/v1/tasks/:taskId/media   — multipart: file + mediaType (BEFORE|AFTER|PROOF|REFERENCE)
GET  /api/v1/tasks/:taskId/media   — list media for task
```

### Notifications
```
POST /api/v1/notifications/device-token  — { token } save Expo push token
GET  /api/v1/notifications?page=         — list + unreadCount
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

### Other
```
GET  /api/v1/zones?city=               — list zones
POST /api/v1/supervisor/dashboard      — supervisor zones + tasks
PATCH /api/v1/zones/:id/inspect        — { dirtyLevel } mark zone
POST /api/v1/citizen/reports           — { category, description, urgency, lat, lng, photoUrl }
GET  /api/v1/citizen/reports           — own reports
GET  /api/v1/worker/wallet             — earnings breakdown
GET  /api/v1/worker/payouts?page=      — payout history
```

### Socket.io Events
```
CLIENT EMITS:
  join_task_room  { taskId }
  leave_task_room { taskId }
  worker:gps      { taskId, lat, lng, accuracy }
  chat:send       { taskId, content }

SERVER EMITS:
  task:updated      { taskId, status }
  task:photo_added  { taskId, media }
  worker:location   { lat, lng, accuracy, timestamp }
  notification:new  { notification }
  chat:message      { id, from, content, taskId, timestamp }
```

---

## 6. FOLDER STRUCTURE

```
eclean-v2/
├── CLAUDE.md               ← This file
├── docker-compose.yml      ← PostgreSQL + Redis for local dev
├── .claude/
│   ├── HANDOFF.md          ← Session state — updated every session
│   ├── SPRINTS.md          ← Sprint plan with checkboxes
│   └── DECISIONS.md        ← Architecture decisions
│
├── backend/                ← COMPLETE — touch only for the 7 fixes in Sprint 0
│   ├── src/
│   │   ├── app.ts
│   │   ├── main.ts
│   │   ├── config/env.ts
│   │   ├── lib/           (prisma, redis, jwt, errors, logger, push, email, cloudinary, bullmq)
│   │   ├── middleware/     (authenticate, authorize, validate, error-handler)
│   │   ├── modules/       (auth, tasks, media, ai, notifications, payouts, zones, supervisor, citizen, admin)
│   │   ├── realtime/socket.ts
│   │   └── jobs/          (ai-verify.job, payout.job)
│   ├── prisma/schema.prisma
│   ├── tests/
│   ├── package.json
│   └── Dockerfile
│
├── mobile/                 ← NEW — being built from scratch
│   ├── App.tsx
│   ├── app.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── babel.config.js
│   └── src/
│       ├── api/            (client, auth, tasks, media, notifications, citizen, zones, payouts)
│       ├── stores/         (authStore, socketStore, locationStore, activeTaskStore, toastStore)
│       ├── hooks/          (usePushNotifications, useBackgroundLocation, useOfflineQueue, etc.)
│       ├── navigation/     (RootNavigator, WorkerNav, BuyerNav, SupervisorNav, CitizenNav)
│       ├── screens/        (auth/, worker/, buyer/, supervisor/, citizen/, shared/)
│       ├── components/     (ui/, maps/, task/, layout/)
│       ├── services/       (backgroundLocation, offlineSync)
│       ├── constants/      (config, colors, fonts, taskCategories)
│       ├── types/
│       └── utils/          (formatMoney, timeAgo, distance, permissions)
```

---

## 7. SEEDED TEST ACCOUNTS

All passwords: `Test@1234`

| Role | Email |
|------|-------|
| BUYER | buyer@eclean.test |
| WORKER | worker@eclean.test |
| ADMIN | admin@eclean.test |
| CITIZEN | citizen@eclean.test |
| SUPERVISOR | supervisor@eclean.test |

---

## 8. LOCAL DEVELOPMENT

```bash
# Start databases
docker-compose up -d

# Start backend (port 3000)
cd backend && npm run dev

# Start mobile (Expo, port 8081)
cd mobile && npx expo start
```

Backend health check: `curl http://localhost:3000/health`

Mobile connects to: `http://localhost:3000` (configured in mobile/src/constants/config.ts)

---

## 9. KEY CONVENTIONS

- Password: 8+ chars, 1 uppercase, 1 digit
- CORS: allows localhost on any port + local network IPs
- Token refresh: `/auth/refresh` accepts `{ refreshToken }` in body (no cookies on mobile)
- Citizen reports: backend expects `lat`/`lng` (not `locationLat`/`locationLng`) + required `category`
- Worker open tasks: uses `radiusKm` param (not `radius`)
- Money display: `formatMoney(amountCents, currency)` → "₹60.00"
- All dates: ISO 8601 strings from API
- Error format: `{ error: { code, message } }`
