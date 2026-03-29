# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.

---

## Last Session: 2026-03-29 (Session 5 — Full Audit + Buyer Redesign + Camera + Optimizations)

### Status: MASSIVE SESSION — 50+ files changed, 3 commits on ecleanpro_checks

### What was completed:

**Codebase Audit (75 issues found):**
- Full audit of mobile (41 issues) + backend (25 issues) + config (9 issues)
- Prioritized by severity: 8 critical, 14 high, 18 medium, 10 low

**Bug Fixes (19 applied):**
- App.tsx: network errors no longer force-logout users (was logging out on any /auth/me failure)
- backgroundLocation.ts: guard against double TaskManager registration
- socketStore.ts: reconnection capped at 20 attempts + jitter (was Infinity)
- AIScoreCard.tsx: auto-normalizes 0-1 and 0-100 scores
- StatusTimeline.tsx: complete status mapping (was Partial, caused undefined)
- useSocket.ts: ref-based handler prevents stale closures
- offlineSync.ts: persisted replay lock survives app crashes (was in-memory only)
- Input.tsx: parent callbacks fire before internal state update
- NotificationsScreen.tsx: removed unsafe `as any` cast
- LiveTrackScreen.tsx: map auto-follows worker with smooth animation
- Backend env.ts: startup warnings for missing service keys (Cloudinary, Anthropic, Razorpay)
- Backend payouts.routes.ts: webhook signature mandatory in production
- Backend schema.prisma: 4 new DB indexes (status+urgency, status+createdAt, buyerId+status, workerId+status)
- Backend tasks.schema.ts: geofence radius min 100m, rate min ₹1 (100 paise)

**Performance Optimizations:**
- React.memo on TaskCard, CaptureCamera, Button, Badge, AppHeader
- useMemo on filtered task arrays (MyTasksScreen, BuyerHomeScreen)
- Image compression before upload (1200px, 75% JPEG via expo-image-manipulator)
- Lazy screen loading in both navigators (6 buyer + 7 worker screens)
- Hermes JS engine enabled in app.json
- Deduplicated haversineKm (was in ActiveTaskScreen + utils) and formatElapsed (was in 3 files)

**Buyer Redesign (Zomato/Uber/Rapido style):**
- New buyerTheme.ts: rose CTA (#F43F5E), slate headers (#1E293B), indigo accents (#6366F1)
- BuyerHomeScreen: dark hero, category pills, LIVE cards, compact stats, trust strip
- All buyer screens auto-themed via B tokens (Dashboard, Tasks, TaskDetail, PostTask, LiveTrack, Rating)
- Removed ScreenWrapper double-padding from BuyerHome + BuyerTasks

**Auth & Onboarding Redesign:**
- SplashScreen: dark slate (#0F172A) + blue logo (was ugly green square #0F2B1A)
- OnboardingScreen: 4 slides with per-slide accent colors (blue, green, purple, amber)
- LoginScreen: neutral blue (#3B82F6), dark header, white form card
- RegisterScreen: role-colored CTA (green worker, blue buyer, purple citizen)
- ForgotPasswordScreen: clean minimal, success state with checkmark
- app.json splash backgroundColor updated to #0F172A

**Camera Overhaul:**
- CaptureCamera: minimal UI, removed viewfinder corners, subtle "Verified capture" badge, haptic on shutter
- PhotoPreview: hidden raw GPS/hash from user, shows "Location verified" badge instead
- CRITICAL FIX: device metadata (GPS, hash, deviceId, timestamp) now sent to backend as form fields
- Backend media.routes.ts reads capturedLat/Lng/At/deviceId/photoHash from multipart
- Backend media.service.ts uses device GPS as primary (EXIF as fallback since compression strips it)
- New Prisma migration: 5 columns added to analytics_photo_meta

**Header/Footer Fixes:**
- All buyer screens use useSafeAreaInsets (removed hardcoded paddingTop: 52/56)
- Tab bar bottom padding for Android phones with nav buttons (Platform.OS check)
- AppHeader memoized with React.memo

**Idempotency + modelVersion (CLAUDE.md rules #10 and #11):**
- TaskMedia gets idempotencyKey column (unique) — prevents duplicate uploads on retry
- Media upload route checks Idempotency-Key header, returns existing if duplicate
- Mobile sends taskId-mediaType-photoHash as idempotency key
- Task gets aiModelVersion column — ai.service.ts stores "claude-sonnet-4-5" on every verification
- Migration auto-runs on Railway deploy

**CI/CD Optimization:**
- Path-based change detection (dorny/paths-filter) — only runs what changed
- Mobile-only push → backend skipped. Backend-only → mobile skipped.
- Skips entirely on docs/markdown/.claude changes
- ~50% Actions minutes savings

### What needs to happen next:

**Priority 1 — Worker screens redesign:**
- WorkerHomeScreen premium redesign (same treatment as BuyerHomeScreen got)
- Worker theme modernization (keep green but make it Rapido/Uber quality)
- WorkerDashboardScreen polish
- FindWorkScreen, MyTasksScreen, WalletScreen visual refresh
- TaskDetailScreen, ActiveTaskScreen, SubmitProofScreen polish

**Priority 2 — Sprint 4 screens:**
- SupervisorHomeScreen (real zone map)
- CitizenHomeScreen + CreateReportScreen
- ProfileScreen with real data from GET /auth/me

**Priority 3 — Play Store readiness:**
- EAS production build
- App icon (blue rounded square with "e")
- Play Store screenshots
- Privacy Policy + Terms of Service

### Branch: ecleanpro_checks (3 commits ahead of main)

### Dev environment:
- Backend: Railway production — healthy
- Mobile: Expo SDK 54, Hermes enabled, dev server via `npx expo start --clear`
- User tests on iPhone via Expo Go (Lingampally, Hyderabad)
- Docker not running locally — migrations need Railway deploy or Docker start

### Key files changed this session:
- Buyer theme: `mobile/src/constants/buyerTheme.ts` (rose/slate/indigo palette)
- AppHeader: `mobile/src/components/layout/AppHeader.tsx` (memoized, consistent height)
- BuyerHomeScreen: `mobile/src/screens/buyer/BuyerHomeScreen.tsx` (full redesign)
- CaptureCamera: `mobile/src/components/camera/CaptureCamera.tsx` (minimal UI)
- PhotoPreview: `mobile/src/components/camera/PhotoPreview.tsx` (hidden metadata)
- Auth screens: `mobile/src/screens/auth/` (all 4 redesigned)
- Media API: `mobile/src/api/media.api.ts` (compression + metadata + idempotency)
- AI service: `backend/src/modules/ai/ai.service.ts` (modelVersion)
- Media routes: `backend/src/modules/media/media.routes.ts` (idempotency + device meta)
- CI: `.github/workflows/ci.yml` (path-based filtering)
