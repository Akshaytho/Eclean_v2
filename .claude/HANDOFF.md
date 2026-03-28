# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.

---

## Last Session: 2026-03-28 (Sessions 1-2-Camera — Marathon Session)

### Status: MAJOR PROGRESS ✅

### What was completed this session:

**CI — Session 1:**
- Backend `/api/v1/ci/seed` endpoint built (protected by `x-ci-secret` header)
- Registered `ciRoutes` in `app.ts`, `CI_SECRET` added to `env.ts`
- Workflow updated: seed step now uses correct secret name `Eclean_CI_Secret`
- Maestro flows: increased post-login wait to 40s (Railway cold start fix)
- ALL 3 workflows disabled (workflow_dispatch only) — re-enable Sprint 6
- NEW: `build-apk.yml` runs on every push to main → downloadable APK from Actions tab

**Session 2 — Components + Hooks:**
- `components/ui/Card.tsx` — base card with shadow + touchable
- `components/ui/Avatar.tsx` — initials (color hashed) + photo fallback
- `components/ui/Skeleton.tsx` + SkeletonCard preset
- `components/ui/EmptyState.tsx` — emoji + title + action
- `components/layout/GradientHeader.tsx` — dark gradient top bar
- `components/task/TaskCard.tsx` — reusable task item
- `components/task/TaskTimer.tsx` — elapsed time from server startedAt
- `components/task/StatusTimeline.tsx` — OPEN→APPROVED visual
- `components/task/AIScoreCard.tsx` — score + EXCELLENT/GOOD/UNCERTAIN/POOR
- `components/maps/WorkerLocationMarker.tsx` — animated pulsing dot
- `components/maps/ZoneOverlay.tsx` — dirty-level polygon for Supervisor
- `hooks/useSocket.ts` + `useJoinTaskRoom`
- `hooks/useGeofence.ts` — haversine distance check
- `hooks/useUnreadCount.ts` — notification badge with real-time update
- `hooks/useOfflineQueue.ts` — queue mutations + auto-replay
- `components/index.ts` + `hooks/index.ts` — barrel exports
- Gap [P3] ✅ — React Query stale times tuned in QueryClient

**CaptureCamera — Evidence Camera System:**
- `components/camera/CaptureCamera.tsx` — full-screen camera, NO gallery
  - GPS + UTC timestamp at exact shutter press moment
  - Device ID bound at capture time
  - BEFORE/AFTER/PROOF/GENERAL type badge
  - Flash + flip controls, colored viewfinder corners
- `components/camera/PhotoPreview.tsx` — preview with Retake / Use Photo
- `components/camera/DashboardCamera.tsx` — quick access for every dashboard
- `services/galleryService.ts` — in-app gallery (NOT phone gallery)
  - Full-res 1200px + 200px thumbnails stored separately
  - JSON metadata alongside each photo
  - cleanOldPhotos() removes uploaded photos >30 days
- `screens/shared/GalleryScreen.tsx` — FlatList 3-col grid
  - getItemLayout for instant scroll
  - Thumbnails only, full-res on tap
  - Upload status dots per photo
- Wired DashboardCamera into WorkerHomeScreen

**Architecture Documents:**
- `GAPS.md` — 42 problems across 9 categories with solutions + auto-pickup rules
- `NEXT_PLAN.md` — 6-session roadmap to production APK
- `eClean_Master_Architecture.pdf` — 15-section master doc (give to any AI session)
  - Incorporates both founder analysis + ChatGPT architectural review
  - Sections: 5 wrappers, Maps, Evidence Camera, AI Verification, Library-independent types,
    modelVersion, Idempotency, GPS state, Performance, Observability, Mistakes, Phases,
    Dependencies, Decision Log

### CI State:
- Jest: 109/109 ✅ (all workflows manual-only until Sprint 6)
- Maestro: disabled — login works, home screen timeout fix applied (40s wait)
- build-apk.yml: ✅ ACTIVE — runs on every push, APK downloadable from Actions tab

### What needs to happen next (Session 3):

**Priority 1 — Wire CaptureCamera into task screens:**
- `ActiveTaskScreen` — replace expo-image-picker with CaptureCamera in photo grid
- `CreateReportScreen` — replace with CaptureCamera
- `InspectZoneScreen` — replace with CaptureCamera
- Wire DashboardCamera into BuyerHomeScreen, CitizenHomeScreen, SupervisorHomeScreen

**Priority 2 — Sprint 3 gap fill:**
- `BuyerTaskDetailScreen` — wire StatusTimeline + AIScoreCard + full-screen photo tap + reject reason modal
- `LiveTrackScreen` — replace static marker with WorkerLocationMarker (animated)
- `PostTaskScreen` — "Use My Location" GPS button on step 3
- `WorkerHomeScreen` — Online/Offline/Busy status toggle

**Priority 3 — Sprint 4 screens:**
- SupervisorHomeScreen — real zone map with ZoneOverlay polygons
- ZoneDetailScreen + InspectZoneScreen (new screens)
- ProfileScreen — real stats from GET /auth/me
- CitizenHomeScreen + CreateReportScreen — verify completeness

### Key files to know:
- Evidence camera: `mobile/src/components/camera/`
- In-app gallery: `mobile/src/services/galleryService.ts`
- Gallery screen: `mobile/src/screens/shared/GalleryScreen.tsx`
- Master architecture: `.claude/` folder + `eClean_Master_Architecture.pdf`
- APK build: `.github/workflows/build-apk.yml` (runs on every push)

### External still needed:
- Mapbox tokens (pk.* + sk.*) from mapbox.com — for Session 4 Mapbox migration
- Railway: `CI_SECRET` env var set to same value as GitHub `Eclean_CI_Secret` secret
- Google Maps API key (for react-native-maps production use)
- Sentry DSN (React Native + Node) — Sprint 5
