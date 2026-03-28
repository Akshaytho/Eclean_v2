# eClean v2 — Claude Code Master Instructions

> **Read this file at the start of EVERY session before writing a single line of code.**
> **Then read `.claude/HANDOFF.md` and `.claude/SPRINTS.md`**
> **Last updated: March 28, 2026**

---

## 1. WHAT IS eCLEAN

eClean is an AI-powered civic work verification platform.
Workers clean public areas → upload before/after/proof photos → Claude Vision AI verifies → payment auto-releases.
Think Uber for civic sanitation work. The worker is the driver. The buyer is the rider.
GPS tracking and AI photo scoring replace the human review system.

**5 roles:** WORKER · BUYER · SUPERVISOR · ADMIN · CITIZEN

**This repo has 2 codebases:**
- `backend/` — Fastify + Prisma + PostgreSQL + Redis + BullMQ + Claude Vision + Cloudinary + Razorpay + Socket.io (**COMPLETE, PRODUCTION on Railway**)
- `mobile/` — React Native + Expo SDK 54 (**IN PROGRESS — Sprints 0-3 complete, Sprint 4 next**)

**DO NOT** create any web frontend code. Admin panel is in a separate repo.

---

## 2. MANDATORY SESSION PROTOCOL

### Every Session START:
```
STEP 1 — Read CLAUDE.md (this file)
STEP 2 — Read .claude/HANDOFF.md (what was done last session + what's next)
STEP 3 — Read .claude/SPRINTS.md (sprint plan with checkboxes)
STEP 4 — Read .claude/GAPS.md (pick ONE relevant gap task for this session)
STEP 5 — Tell user: sprint we're in, what's done, what's next, which gap you picked
STEP 6 — WAIT for user confirmation before writing any code
```

### Every Session END:
```
STEP 1 — Update .claude/HANDOFF.md (completed, blockers, next steps)
STEP 2 — Update .claude/SPRINTS.md checkboxes
STEP 3 — Mark gap item [x] in .claude/GAPS.md + add to COMPLETION LOG
STEP 4 — git add specific files only — NEVER git add . or git add -A
STEP 5 — git commit with descriptive message
STEP 6 — Report: what was done, what's next
```

---

## 3. HOW TO TEST — EMULATOR & DEVICE GUIDE

**Read this before making any UI or feature changes.**

### Option A — Android Emulator (recommended for development)

```bash
# Step 1: Open Android Studio → Device Manager → Start your emulator
# OR from terminal (replace with your AVD name):
emulator -avd Pixel_6_API_34
# List available AVDs:
emulator -list-avds

# Step 2: Start Expo dev server
cd mobile
npx expo start --android
# Expo opens on the emulator automatically
```

**For native modules (camera, GPS, maps) — build dev client once:**
```bash
cd mobile
npx expo run:android
# Takes ~10 mins first time, installs dev client on emulator
# After that, just use: npx expo start
# Press 'a' to reload on emulator — no rebuild
```

### Option B — Real Android Device (USB)

```bash
# Step 1: Enable on phone:
#   Settings → About Phone → tap Build Number 7 times
#   Settings → Developer Options → USB Debugging → ON

# Step 2: Connect USB, verify device is visible:
adb devices
# Should show: "emulator-xxxx device" or "XXXXXX device"

# Step 3: Run
cd mobile
npx expo start
# Press 'a' in terminal, or scan QR with Expo Go app
```

### Option C — Expo Go (fastest start, but limited)

```bash
cd mobile
npx expo start
# Scan QR code with Expo Go app on phone
```

**⚠️ Expo Go CANNOT run these — needs dev client (Option A or B):**
- `expo-camera` (CaptureCamera component)
- `react-native-maps` (FindWorkScreen, ActiveTaskScreen, LiveTrackScreen)
- `expo-task-manager` (background GPS tracking)
- `@gorhom/bottom-sheet` (task bottom sheets)

### Hot reload (instant, no rebuild needed):
Any change to `.tsx`, `.ts`, styles, logic → saved → app updates in < 1 second.

### What triggers a full rebuild (~5-10 mins):
- `npx expo install <new-package>` (adding new native package)
- Changing `app.json` plugins section
- Changing native module config

### Starting backend locally for testing:
```bash
# Start databases
docker-compose up -d

# Start backend
cd backend && npm run dev

# Backend runs at http://localhost:3000
# Mobile config: mobile/src/constants/config.ts
# Change API_URL to http://localhost:3000 for local testing
# Change back to https://ecleanfuture-production.up.railway.app for prod
```

### CI APK (GitHub Actions) — for sharing only:
- Runs automatically on every push to main
- Download: github.com/Akshaytho/Eclean_v2 → Actions tab → "Build Debug APK" → Artifacts
- Takes ~20 mins — don't use for iteration

---

## 4. PRODUCTION RULES — NEVER BREAK THESE

| # | Rule | Why |
|---|------|-----|
| 1 | Never `git add .` — stage specific files only | Prevents committing secrets |
| 2 | Never hardcode secrets — use `process.env` | Security |
| 3 | Money always integer paise — never floats | Financial accuracy |
| 4 | Tokens in SecureStore — NEVER AsyncStorage | Encrypted storage |
| 5 | GPS via `socket.emit('worker:gps')` — NOT HTTP | Real-time buyer tracking |
| 6 | Timer from server `task.startedAt` — NOT `useState(0)` | Survives restart |
| 7 | Background location via expo-task-manager | Works when phone locked |
| 8 | All routes have Zod validation | No unvalidated input |
| 9 | Protected routes use `authenticate` middleware | Never decode JWT manually |
| 10 | Upload endpoints check `Idempotency-Key` header | No duplicate records on retry |
| 11 | AI response always includes `modelVersion` field | Traceable for disputes |
| 12 | Screens never import map/camera/AI libs directly | Use abstraction wrappers |
| 13 | HANDOFF.md updated before every session close | Continuity |

---

## 5. ABSTRACTION WRAPPERS — NEVER BYPASS THESE

Screens must NEVER import these libraries directly:

| Don't import | Use instead |
|---|---|
| `react-native-maps` | `MapContainer` component |
| `expo-camera` or `expo-image-picker` | `CaptureCamera` component |
| Anthropic SDK directly | `aiService.verify()` in backend |
| expo-notifications | `notificationsApi` |

If you see a screen importing a map/camera/AI library directly — refactor it to the wrapper first before adding features.

---

## 6. TECH STACK

### Backend (COMPLETE — only touch for specific fixes)
Fastify 4 · PostgreSQL 16 + Prisma · Redis + BullMQ · Cloudinary · Claude Vision (Anthropic) · Razorpay · Socket.io · Resend · JWT + bcrypt

### Mobile (IN PROGRESS)
React Native + Expo SDK 54 · @react-navigation v7 · @tanstack/react-query v5 · Zustand v5 · react-native-maps · socket.io-client · Axios · expo-location + expo-task-manager · expo-camera · expo-file-system · expo-image-manipulator · expo-secure-store · react-native-reanimated · react-native-gesture-handler · @gorhom/bottom-sheet · lucide-react-native

---

## 7. BACKEND API REFERENCE

### Auth
```
POST /api/v1/auth/register        — { email, password, name, role }
POST /api/v1/auth/login           — { email, password }
POST /api/v1/auth/refresh         — { refreshToken }
POST /api/v1/auth/logout
GET  /api/v1/auth/me              — returns user + profile + stats
POST /api/v1/auth/forgot-password — { email }
POST /api/v1/auth/reset-password  — { token, password }
```

### Buyer Tasks
```
POST  /api/v1/buyer/tasks
GET   /api/v1/buyer/tasks?status=&page=&limit=
GET   /api/v1/buyer/tasks/:taskId
POST  /api/v1/buyer/tasks/:taskId/approve
POST  /api/v1/buyer/tasks/:taskId/reject     — { reason }
POST  /api/v1/buyer/tasks/:taskId/cancel     — { reason }
POST  /api/v1/buyer/tasks/:taskId/rate       — { rating: 1-5 }
GET   /api/v1/buyer/tasks/:taskId/chat
```

### Worker Tasks
```
GET  /api/v1/worker/tasks/open?category=&urgency=&lat=&lng=&radiusKm=&page=&limit=
GET  /api/v1/worker/tasks/:taskId
GET  /api/v1/worker/my-tasks?status=&page=&limit=
POST /api/v1/worker/tasks/:taskId/accept
POST /api/v1/worker/tasks/:taskId/start      — { lat, lng }
POST /api/v1/worker/tasks/:taskId/submit
POST /api/v1/worker/tasks/:taskId/cancel     — { reason }
POST /api/v1/worker/tasks/:taskId/dispute    — { reason }
GET  /api/v1/worker/tasks/:taskId/chat
GET  /api/v1/worker/wallet
GET  /api/v1/worker/payouts?page=
```

### Media
```
POST /api/v1/tasks/:taskId/media   — multipart: file + mediaType (BEFORE|AFTER|PROOF)
GET  /api/v1/tasks/:taskId/media
```

### Other
```
GET  /api/v1/notifications?page=
POST /api/v1/notifications/device-token     — { token }
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
GET  /api/v1/zones?city=
PATCH /api/v1/zones/:id/inspect             — { dirtyLevel }
POST /api/v1/citizen/reports                — { category, description, urgency, lat, lng, photoUrl }
GET  /api/v1/citizen/reports
POST /api/v1/ci/seed                        — header: x-ci-secret (CI only)
```

### Socket.io Events
```
CLIENT EMITS:
  join_task_room  { taskId }
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

## 8. TEST ACCOUNTS (password: Test@1234)

| Role | Email |
|------|-------|
| BUYER | buyer@eclean.test |
| WORKER | worker@eclean.test |
| ADMIN | admin@eclean.test |
| CITIZEN | citizen@eclean.test |
| SUPERVISOR | supervisor@eclean.test |
| CI Worker | maestro-worker@eclean.test |
| CI Buyer | maestro-buyer@eclean.test |

---

## 9. CURRENT STATE (March 28, 2026)

### Sprint Status
- Sprint 0 — Foundation ✅ COMPLETE
- Sprint 1 — Auth + Navigation ✅ COMPLETE
- Sprint 2 — Worker Flow ✅ COMPLETE (minor gaps)
- Sprint 3 — Buyer Flow ✅ BUILT (gaps to fill — see SPRINTS.md)
- Sprint 4 — Supervisor + Citizen + Profile ⬜ PLACEHOLDERS ONLY
- Sprint 5 — Polish + EAS Build ⬜ NOT STARTED

### Key built components
- `components/ui/` — Card, Avatar, Skeleton, EmptyState, Badge, Button, Input, Toast
- `components/layout/` — ScreenWrapper, GradientHeader
- `components/task/` — TaskCard, TaskTimer, StatusTimeline, AIScoreCard
- `components/maps/` — WorkerLocationMarker, ZoneOverlay
- `components/camera/` — CaptureCamera, PhotoPreview, DashboardCamera
- `services/` — backgroundLocation, offlineSync, galleryService
- `hooks/` — useSocket, useGeofence, useUnreadCount, useOfflineQueue, useBackgroundLocation

### What's placeholder (needs real implementation)
- `screens/supervisor/SupervisorHomeScreen.tsx` — 24 lines, no real content
- `screens/supervisor/ZonesScreen.tsx` — 24 lines, no real content
- `screens/shared/ProfileScreen.tsx` — shows "Full stats coming in Sprint 4"

### Sprint 3 gaps (must fix before Sprint 5)
- BuyerTaskDetailScreen: StatusTimeline + AIScoreCard not wired in yet
- LiveTrackScreen: needs animated WorkerLocationMarker
- PostTaskScreen: "Use My Location" GPS button missing on step 3
- WorkerHomeScreen: Online/Offline/Busy status toggle missing
- ActiveTaskScreen: still uses expo-image-picker, needs CaptureCamera

---

## 10. CI/CD STATUS

### build-apk.yml ✅ ACTIVE (runs on every push to main)
Download APK: Actions tab → "Build Debug APK" → Artifacts → eclean-debug-apk-{N}

### Jest, Maestro, CI Failure Tracker — DISABLED (workflow_dispatch only)
Re-enable before Sprint 6 by restoring `on: push:` triggers.
Jest: 109/109 passing. Maestro: login working, home screen timeout fix applied.

---

## 11. KEY FILE LOCATIONS

```
Session state:         .claude/HANDOFF.md
Sprint plan:           .claude/SPRINTS.md
Gaps registry:         .claude/GAPS.md
Next plan:             .claude/NEXT_PLAN.md
Colors:                mobile/src/constants/colors.ts
Types:                 mobile/src/types/index.ts
API client:            mobile/src/api/client.ts
App entry:             mobile/App.tsx
Backend entry:         backend/src/app.ts
Backend env:           backend/src/config/env.ts
Abstraction wrappers:  mobile/src/components/camera/CaptureCamera.tsx
                       (MapContainer — to be built in Sprint 4)
Gallery service:       mobile/src/services/galleryService.ts
```
