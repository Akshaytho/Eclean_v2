# eClean v2 — Architecture Reference

> One file to understand the entire codebase.
> For any feature, find the section below — it lists every file you'll touch.

---

## Project Structure

```
Eclean_v2/
├── backend/              Fastify API (production on Railway)
│   ├── prisma/           Database schema + migrations
│   └── src/
│       ├── config/       Environment variables (Zod-validated)
│       ├── lib/          Shared utilities (Prisma, Redis, JWT, EXIF, etc.)
│       ├── middleware/    Auth, authorization, validation, error handling
│       ├── modules/      Feature modules (routes + schema + service)
│       ├── intelligence/  Analytics + B2B data export (separate concern)
│       ├── jobs/         BullMQ background workers
│       └── realtime/     Socket.io (GPS, chat, live updates)
│
├── mobile/               React Native + Expo SDK 54
│   └── src/
│       ├── api/          API client + endpoint wrappers
│       ├── components/   Reusable UI (camera, maps, task, ui, layout)
│       ├── constants/    Colors, themes, config
│       ├── hooks/        Custom hooks (socket, geofence, location, etc.)
│       ├── navigation/   React Navigation stacks per role
│       ├── screens/      Screens grouped by role
│       ├── services/     Background location, offline sync, gallery
│       ├── stores/       Zustand state (auth, socket, location, toast)
│       ├── types/        TypeScript interfaces
│       └── utils/        Formatters, distance calc, permissions
│
└── .github/workflows/    CI/CD (Quality Gate → APK Build → Release)
```

---

## Feature Map

For each feature, here's every file involved — backend and mobile.
When working on a feature, **only touch files in that feature's section**.

---

### 1. AUTH (Login, Register, Tokens)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `prisma/schema.prisma` → `User`, `WorkerProfile`, `BuyerProfile` | User + role profiles |
| **Backend** | `modules/auth/auth.routes.ts` | `/api/v1/auth/*` endpoints |
| | `modules/auth/auth.schema.ts` | Zod validation |
| | `modules/auth/auth.service.ts` | Register, login, refresh, me, password reset |
| | `lib/jwt.ts` | Token sign/verify |
| | `middleware/authenticate.ts` | JWT middleware |
| | `middleware/authorize.ts` | Role check middleware |
| **Mobile** | `api/auth.api.ts` | API calls |
| | `stores/authStore.ts` | Zustand — user, tokens (SecureStore), logout |
| | `screens/auth/LoginScreen.tsx` | Login form |
| | `screens/auth/RegisterScreen.tsx` | Register with role picker |
| | `screens/auth/ForgotPasswordScreen.tsx` | Password reset |
| | `screens/auth/SplashScreen.tsx` | Token check on app start |
| | `screens/auth/OnboardingScreen.tsx` | First-time intro |
| | `navigation/RootNavigator.tsx` | Auth vs App routing |

**Status: COMPLETE**

---

### 2. TASKS (Create, Accept, Start, Submit, Approve, Reject)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Task`, `TaskEvent`, `TaskLocationLog` | Task lifecycle |
| **Backend** | `modules/tasks/tasks.service.ts` | All task business logic |
| | `modules/tasks/tasks.schema.ts` | Zod + pricing constants |
| | `modules/tasks/tasks.state-machine.ts` | Valid status transitions |
| | `modules/tasks/tasks.controller.ts` | Shared controller logic |
| | `modules/tasks/buyer.routes.ts` | `/api/v1/buyer/tasks/*` |
| | `modules/tasks/worker.routes.ts` | `/api/v1/worker/*` |
| **Mobile — Buyer** | `api/tasks.api.ts` → `buyerTasksApi` | Buyer API calls |
| | `screens/buyer/PostTaskScreen.tsx` | 4-step task creation wizard |
| | `screens/buyer/BuyerTasksScreen.tsx` | Task list with status tabs |
| | `screens/buyer/BuyerTaskDetailScreen.tsx` | Detail + approve/reject |
| | `screens/buyer/RatingScreen.tsx` | Rate worker after approval |
| **Mobile — Worker** | `api/tasks.api.ts` → `workerTasksApi` | Worker API calls |
| | `screens/worker/FindWorkScreen.tsx` | Map with open tasks |
| | `screens/worker/TaskDetailScreen.tsx` | View task before accepting |
| | `screens/worker/ActiveTaskScreen.tsx` | GPS + photos + timer (806 lines, most complex) |
| | `screens/worker/SubmitProofScreen.tsx` | Review photos before submit |
| | `screens/worker/MyTasksScreen.tsx` | Worker's task history |
| **Shared** | `components/task/TaskCard.tsx` | Task list item |
| | `components/task/StatusTimeline.tsx` | Visual status progress |
| | `components/task/TaskTimer.tsx` | Elapsed time display |

**Status: COMPLETE** — full lifecycle works end-to-end

---

### 3. PHOTOS + EXIF (Upload, GPS Validation, Fraud Detection)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `TaskMedia`, `AnalyticsPhotoMeta` | Photos + EXIF analytics |
| **Backend** | `modules/media/media.routes.ts` | `POST/GET /tasks/:id/media` |
| | `modules/media/media.schema.ts` | Allowed types, size limits |
| | `modules/media/media.service.ts` | Upload to Cloudinary + EXIF + fraud flag |
| | `lib/exif.ts` | EXIF parser (GPS, timestamp, device) |
| | `lib/cloudinary.ts` | Cloudinary client |
| **Mobile** | `api/media.api.ts` | Upload + list API |
| | `components/camera/CaptureCamera.tsx` | Camera wrapper (expo-camera) |
| | `components/camera/PhotoPreview.tsx` | Preview after capture |
| | `components/camera/DashboardCamera.tsx` | Quick-capture widget |
| | `services/galleryService.ts` | Pick from device gallery |

**Status: COMPLETE** — uploads, EXIF extraction, GPS distance check, fraud flagging all work

---

### 4. AI VERIFICATION (Claude Vision Scoring)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Task.aiScore`, `Task.aiReasoning` | AI results stored on task |
| **Backend** | `modules/ai/ai.service.ts` | Claude Vision API call + JSON parsing |
| | `jobs/ai-verify.job.ts` | BullMQ worker — async verification after submit |
| **Mobile** | `components/task/AIScoreCard.tsx` | Score + reasoning display |
| | `screens/buyer/BuyerTaskDetailScreen.tsx` | Shows AI card when score exists |

**How it works:**
1. Worker submits task → backend enqueues `ai-verify` BullMQ job
2. Job fetches BEFORE/AFTER/PROOF photo URLs from Cloudinary
3. Sends all 3 images to Claude claude-sonnet-4-5 with structured prompt
4. Claude returns: `{ score, label, reasoning, workEvident, suspiciousActivity, recommendation }`
5. Score saved to `task.aiScore`, reasoning to `task.aiReasoning`
6. Buyer gets notification: "AI scored 85% — please review"

**Status: COMPLETE** — needs Anthropic API key in Railway env to run in production

---

### 5. PAYMENTS (Razorpay Escrow + Worker Payout)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Payout` | Payment records |
| **Backend** | `jobs/payout.job.ts` | BullMQ worker — calls Razorpay Payout API |
| | `modules/payouts/payouts.routes.ts` | Wallet, payout list, Razorpay webhook |
| | `modules/tasks/tasks.service.ts` → `approveTask()` | Creates Payout + enqueues job |
| **Mobile** | `api/payouts.api.ts` | Wallet + payout API calls |
| | `screens/worker/WalletScreen.tsx` | Balance + payout history (204 lines) |

**How it works:**
1. Buyer approves task → `approveTask()` creates Payout record (10% platform fee)
2. BullMQ job calls Razorpay Payout API → sets status PROCESSING
3. Razorpay webhook confirms → updates to COMPLETED
4. Worker gets notification: "Payment received"

**What's missing:**
- Buyer escrow capture on task creation (Razorpay Orders API)
- Refund flow on cancellation
- Razorpay test keys not yet in Railway env vars

**Status: 70% DONE** — payout side complete, buyer payment capture missing

---

### 6. GPS + LIVE TRACKING

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `TaskLocationLog` | GPS trail stored |
| **Backend** | `realtime/socket.ts` | Socket.io — `worker:gps` → `worker:location` relay |
| **Mobile** | `services/backgroundLocation.ts` | expo-task-manager GPS tracking |
| | `hooks/useBackgroundLocation.ts` | Hook wrapper for screens |
| | `hooks/useGeofence.ts` | Check if worker is near task |
| | `stores/locationStore.ts` | Current GPS + tracking state |
| | `stores/activeTaskStore.ts` | GPS trail + elapsed time |
| | `stores/socketStore.ts` | Socket connection + GPS emit |
| | `screens/buyer/LiveTrackScreen.tsx` | Buyer sees worker on map |
| | `screens/worker/ActiveTaskScreen.tsx` | Worker map + GPS trail |
| | `components/maps/WorkerLocationMarker.tsx` | Animated map marker |

**Status: COMPLETE**

---

### 7. REAL-TIME CHAT

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `ChatMessage` | Chat history |
| **Backend** | `realtime/socket.ts` | `chat:send` → `chat:message` relay |
| **Mobile** | `screens/shared/ChatScreen.tsx` | Chat UI (156 lines) |
| | `hooks/useSocket.ts` | Socket event subscription |

**Status: COMPLETE**

---

### 8. NOTIFICATIONS

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Notification` | In-app notifications |
| **Backend** | `modules/notifications/notifications.routes.ts` | List, mark-read, device token |
| | `modules/notifications/notifications.service.ts` | CRUD |
| | `lib/push.ts` | Firebase push (optional) |
| **Mobile** | `api/notifications.api.ts` | API calls |
| | `screens/shared/NotificationsScreen.tsx` | Notification list |
| | `hooks/useUnreadCount.ts` | Badge count hook |
| | `hooks/usePushNotifications.ts` | Expo push setup |

**Status: COMPLETE** — Firebase push needs service account key in env

---

### 9. SUPERVISOR FLOW

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Zone` | Zone boundaries + dirty level |
| **Backend** | `modules/supervisor/supervisor.routes.ts` | Dashboard, task flagging |
| | `modules/supervisor/supervisor.service.ts` | Zone stats, worker activity |
| | `modules/zones/zones.routes.ts` | Zone list + inspect |
| | `modules/zones/zones.service.ts` | Zone CRUD |
| **Mobile** | `api/zones.api.ts` | Zone API calls |
| | `navigation/SupervisorNavigator.tsx` | Tab navigation |
| | `screens/supervisor/SupervisorHomeScreen.tsx` | Dashboard (157 lines) |
| | `screens/supervisor/ZonesScreen.tsx` | Zone list (24 lines — PLACEHOLDER) |
| | `screens/supervisor/ZoneDetailScreen.tsx` | Zone detail (143 lines) |
| | `screens/supervisor/InspectZoneScreen.tsx` | Inspect + set dirty level (158 lines) |
| | `components/maps/ZoneOverlay.tsx` | Zone polygon on map |

**Status: 60% DONE** — backend complete, mobile screens partially built, ZonesScreen is placeholder

---

### 10. CITIZEN FLOW

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `CitizenReport` | Citizen reports |
| **Backend** | `modules/citizen/citizen.routes.ts` | Create + list reports |
| | `modules/citizen/citizen.service.ts` | Report logic + task conversion |
| **Mobile** | `api/citizen.api.ts` | API calls |
| | `navigation/CitizenNavigator.tsx` | Tab navigation |
| | `screens/citizen/CitizenHomeScreen.tsx` | Report list (151 lines) |
| | `screens/citizen/CreateReportScreen.tsx` | Submit report (226 lines) |

**Status: 80% DONE** — backend complete, mobile screens built, needs testing

---

### 11. ADMIN

| Layer | File | Purpose |
|-------|------|---------|
| **Backend** | `modules/admin/admin.routes.ts` | User mgmt, disputes, payouts, API keys |
| | `modules/admin/admin.service.ts` | Admin business logic |
| | `modules/admin/admin.controller.ts` | Controller |
| **Mobile** | None — admin panel is a separate web repo | |

**Status: BACKEND COMPLETE** — no mobile admin screens (by design)

---

### 12. ANALYTICS + INTELLIGENCE (B2B)

| Layer | File | Purpose |
|-------|------|---------|
| **DB** | `schema.prisma` → `Analytics*` models, `EventLog`, `ApiKey` | Analytics tables |
| **Backend** | `intelligence/analytics/analytics.service.ts` | Zone trends, heatmaps, fraud |
| | `intelligence/data-export/export.service.ts` | B2B data export |
| | `jobs/analytics-aggregate.job.ts` | Daily 2AM aggregation |
| | `lib/event-log.ts` | Event bridge (core writes, intelligence reads) |

**Status: COMPLETE** — can be extracted to separate repo later

---

## Shared Infrastructure

| File | Purpose | Used By |
|------|---------|---------|
| `lib/prisma.ts` | Database client singleton | All modules |
| `lib/redis.ts` | Redis client | Socket.io adapter, BullMQ |
| `lib/bullmq.ts` | BullMQ connection | Jobs |
| `lib/logger.ts` | Pino structured logger | Everything |
| `lib/errors.ts` | Error classes (400, 401, 403, 404, 409) | All routes |
| `lib/email.ts` | Resend email client | Auth (password reset) |
| `lib/event-log.ts` | Event bridge to analytics | Task/media mutations |
| `middleware/validate.ts` | Zod validation middleware | All routes |
| `middleware/error-handler.ts` | Global error handler | Fastify |
| `config/env.ts` | Zod-validated env vars | Everything |
| `realtime/socket.ts` | Socket.io server + event handlers | GPS, chat, live updates |

---

## Mobile Shared Components

| Component | File | Used In |
|-----------|------|---------|
| `CaptureCamera` | `components/camera/CaptureCamera.tsx` | ActiveTaskScreen, PostTaskScreen |
| `PhotoPreview` | `components/camera/PhotoPreview.tsx` | After photo capture |
| `TaskCard` | `components/task/TaskCard.tsx` | FindWorkScreen, MyTasksScreen, BuyerTasksScreen |
| `AIScoreCard` | `components/task/AIScoreCard.tsx` | BuyerTaskDetailScreen |
| `StatusTimeline` | `components/task/StatusTimeline.tsx` | BuyerTaskDetailScreen |
| `TaskTimer` | `components/task/TaskTimer.tsx` | ActiveTaskScreen |
| `Avatar` | `components/ui/Avatar.tsx` | Profile, task detail, chat |
| `Badge` / `StatusBadge` | `components/ui/Badge.tsx` | TaskCard, detail screens |
| `Button` | `components/ui/Button.tsx` | Everywhere |
| `Card` | `components/ui/Card.tsx` | Dashboard cards |
| `EmptyState` | `components/ui/EmptyState.tsx` | Empty lists |
| `Input` | `components/ui/Input.tsx` | Forms |
| `Skeleton` | `components/ui/Skeleton.tsx` | Loading states |
| `Toast` | `components/ui/Toast.tsx` | Success/error toasts |
| `ScreenWrapper` | `components/layout/ScreenWrapper.tsx` | Most screens |
| `GradientHeader` | `components/layout/GradientHeader.tsx` | Home screens |

---

## Mobile State Management

| Store | File | What it holds |
|-------|------|---------------|
| `authStore` | `stores/authStore.ts` | User, tokens (SecureStore), login state |
| `socketStore` | `stores/socketStore.ts` | Socket.io connection, emit helpers |
| `activeTaskStore` | `stores/activeTaskStore.ts` | Active task, GPS trail, elapsed time |
| `locationStore` | `stores/locationStore.ts` | Current GPS, tracking state |
| `toastStore` | `stores/toastStore.ts` | Toast queue |

---

## Database Models (21 total)

| Model | Table | Module |
|-------|-------|--------|
| `User` | users | Auth |
| `WorkerProfile` | worker_profiles | Auth |
| `BuyerProfile` | buyer_profiles | Auth |
| `Zone` | zones | Supervisor |
| `Task` | tasks | Tasks |
| `TaskMedia` | task_media | Media |
| `TaskEvent` | task_events | Tasks |
| `TaskLocationLog` | task_location_logs | GPS |
| `ChatMessage` | chat_messages | Chat |
| `Payout` | payouts | Payments |
| `Notification` | notifications | Notifications |
| `CitizenReport` | citizen_reports | Citizen |
| `EventLog` | event_log | Analytics bridge |
| `AnalyticsZoneSnapshot` | analytics_zone_snapshots | Intelligence |
| `AnalyticsPlatformMetrics` | analytics_platform_metrics | Intelligence |
| `AnalyticsWastePattern` | analytics_waste_patterns | Intelligence |
| `AnalyticsWorkerDaily` | analytics_worker_daily | Intelligence |
| `AnalyticsPhotoMeta` | analytics_photo_meta | Media/EXIF |
| `AnalyticsBehaviorEvent` | analytics_behavior_events | Intelligence |
| `DataExportLog` | data_export_logs | Intelligence |
| `ApiKey` | api_keys | B2B access |

---

## Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Prisma |
| `REDIS_URL` | Yes | BullMQ, Socket.io |
| `JWT_ACCESS_SECRET` | Yes | Auth |
| `JWT_REFRESH_SECRET` | Yes | Auth |
| `CLOUDINARY_CLOUD_NAME` | For media | Photo upload |
| `CLOUDINARY_API_KEY` | For media | Photo upload |
| `CLOUDINARY_API_SECRET` | For media | Photo upload |
| `ANTHROPIC_API_KEY` | For AI | Claude Vision verification |
| `RAZORPAY_KEY_ID` | For payments | Escrow + payout |
| `RAZORPAY_KEY_SECRET` | For payments | Escrow + payout |
| `RAZORPAY_WEBHOOK_SECRET` | For payments | Webhook signature verification |
| `RESEND_API_KEY` | For email | Password reset emails |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | For push | Push notifications |

---

## What's Left to Build

### Must have (for sponsor demo)
1. **Razorpay buyer escrow capture** — buyer pays when posting task (backend + mobile)
2. **Razorpay refund on cancel** — return escrow if task cancelled (backend)
3. **Deploy API keys** — Razorpay + Anthropic keys on Railway env vars
4. **ZonesScreen.tsx** — 24-line placeholder, needs real zone list

### Nice to have
5. Demo/onboarding mode
6. Before/after photo comparison on BuyerTaskDetailScreen
7. Worker identity verification flow
8. Dark mode
9. EAS build for Play Store

---

## Rules for Developers

1. **Never import maps/camera/AI directly in screens** — use the wrapper components
2. **Money is always integer paise** — never use floats (`rateCents / 100` only for display)
3. **Tokens in SecureStore** — never AsyncStorage
4. **GPS via socket** — `worker:gps` emit, never HTTP POST
5. **Timer from server** — use `task.startedAt`, never local state
6. **Every backend mutation logs to EventLog** — for analytics pipeline
7. **Backend: schema + routes + service pattern** — keep them in sync
8. **Mobile: screen reads from API, writes via mutation** — Zustand only for session state
