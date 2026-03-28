# eClean v2 — Next Plan of Action
> Created: March 28, 2026 | Based on PDF Blueprint audit vs current codebase

---

## WHERE WE ACTUALLY ARE (Honest Gap Analysis)

### ✅ Fully Done (Matches PDF Blueprint)
| What | PDF Reference | Status |
|------|--------------|--------|
| Backend (all 7 fixes) | Part 2 | ✅ Complete |
| Sprint 0 — Foundation, stores, API client, services | Part 5 Sprint 0 | ✅ Complete |
| Sprint 1 — All 5 auth screens + all 5 navigators | Part 5 Sprint 1 | ✅ Complete |
| Sprint 2 — All 7 worker screens | Part 5 Sprint 2 | ✅ Complete |
| Sprint 3 — All 6 buyer screens | Part 5 Sprint 3 | ✅ Complete |
| Background location service | Part 4 Architecture | ✅ Complete |
| Socket GPS (emit not HTTP) | Part 4 Architecture | ✅ Complete |
| Timer from server startedAt | Part 4 Architecture | ✅ Complete |
| react-native-maps, reanimated, gesture-handler, bottom-sheet | Part 3 | ✅ Installed |
| All CI/CD pipeline (Jest 109 tests, Maestro E2E) | — | ✅ Running |

### ❌ Not Built (PDF says it should exist)
| What | PDF Reference | Priority |
|------|--------------|----------|
| **Sprint 4: SupervisorHomeScreen** (real — zone map + polygon overlays) | Sprint 4 | 🔴 |
| **Sprint 4: ZoneDetailScreen** | Sprint 4 | 🔴 |
| **Sprint 4: InspectZoneScreen** | Sprint 4 | 🔴 |
| **Sprint 4: ProfileScreen** (real data — stats, rating, earned) | Sprint 4 | 🔴 |
| CitizenHomeScreen + CreateReportScreen — files exist but need verification | Sprint 4 | 🟡 |
| `useOfflineQueue` hook | Part 4 | 🔴 |
| `useUnreadCount` hook | Part 4 | 🟡 |
| `useSocket` hook | Part 4 | 🟡 |
| `useGeofence` hook | Part 4 | 🟡 |
| `components/maps/WorkerLocationMarker` (animated pulsing dot) | Part 4 | 🟡 |
| `components/maps/LiveTrackingMap` | Part 4 | 🟡 |
| `components/maps/ZoneOverlay` | Part 4 | 🟡 |
| `components/task/StatusTimeline` | Part 4 | 🔴 |
| `components/task/AIScoreCard` | Part 4 | 🔴 |
| `components/task/PhotoUploadGrid` | Part 4 | 🟡 |
| `components/task/TaskCard` | Part 4 | 🟡 |
| `components/task/TaskTimer` | Part 4 | 🟡 |
| `components/ui/Card, Avatar, Skeleton, EmptyState` | Part 4 | 🟡 |
| `components/layout/GradientHeader` | Part 4 | 🟡 |
| Backend `/api/v1/ci/seed` endpoint for Maestro test accounts | CI Fix | 🔴 |
| Sprint 3 screen tests (buyer flow) | Sprint 3 | 🟡 |
| Sprint 4 screen tests | Sprint 4 | 🟡 |
| `@sentry/react-native` crash reporting | Sprint 5 | 🟡 |

### 🟡 Built But Incomplete (Sprint 3 Gaps from PDF)
| Screen | What's Missing | PDF Reference |
|--------|---------------|---------------|
| BuyerTaskDetailScreen | StatusTimeline component, AIScoreCard component, full-screen photo tap viewer, reject reason modal | Sprint 3 |
| LiveTrackScreen | Animated pulsing WorkerLocationMarker, worker info overlay (name + time on site) | Sprint 3 |
| PostTaskScreen | "Use My Location" GPS button on step 3, work window times on step 4 | Sprint 3 |
| BuyerTasksScreen | Search by title | Sprint 3 |
| WorkerHomeScreen | Online/Offline/Busy status toggle | Sprint 2 gap |
| ProfileScreen | Placeholder only — "Full stats coming in Sprint 4" | Sprint 4 |
| SupervisorHomeScreen | Placeholder only — 24 lines | Sprint 4 |
| ZonesScreen | Placeholder only — 24 lines | Sprint 4 |

---

## THE PLAN — What We Do Next (In Order)

### PHASE 1: Fix CI First (1 session)
**Why first:** Every session we push code, CI runs. If Maestro always fails it's noise.
**What to do:**
1. Add `/api/v1/ci/seed` endpoint to backend (protected by `CI_SECRET` env var) — creates test accounts idempotently
2. Update `Create test accounts` step in workflow to call this endpoint
3. Fix the debug step curl JSON quoting bug
4. Verify Maestro flows pass end-to-end

**Expected result:** Green CI on every push going forward.

---

### PHASE 2: Missing Shared Components (1 session)
**Why second:** Every sprint 4 screen needs these. Build once, use everywhere.
**What to build:**
- `components/ui/Card.tsx` — base card with shadow
- `components/ui/Avatar.tsx` — user initials + photo
- `components/ui/Skeleton.tsx` — loading placeholder
- `components/ui/EmptyState.tsx` — empty list state with icon
- `components/layout/GradientHeader.tsx` — dark gradient top bar
- `components/task/TaskCard.tsx` — reusable task item for lists
- `components/task/TaskTimer.tsx` — elapsed time from startedAt
- `components/task/StatusTimeline.tsx` — OPEN→ACCEPTED→IN_PROGRESS→SUBMITTED→APPROVED
- `components/task/AIScoreCard.tsx` — score + EXCELLENT/GOOD/UNCERTAIN/POOR badge
- `components/maps/WorkerLocationMarker.tsx` — animated pulsing blue dot
- `components/maps/ZoneOverlay.tsx` — zone polygon on map

**Also build these hooks:**
- `hooks/useSocket.ts` — subscribe/unsubscribe helper with cleanup
- `hooks/useGeofence.ts` — haversine distance check
- `hooks/useUnreadCount.ts` — notification badge count
- `hooks/useOfflineQueue.ts` — queue mutations, retry on reconnect

**Expected result:** All building blocks ready. Sprint 3 gaps can be filled. Sprint 4 can start immediately.

---

### PHASE 3: Sprint 3 Gap Fill (1 session)
**Why third:** You tested the app on your phone — these are the rough edges you noticed.
**What to fix:**

**BuyerTaskDetailScreen:**
- Wire in `StatusTimeline` component at top
- Wire in `AIScoreCard` component (real score from API)
- Add full-screen photo modal on tap
- Reject reason modal with 10-char minimum validation

**LiveTrackScreen:**
- Replace static marker with `WorkerLocationMarker` (animated pulsing)
- Add worker info overlay (name, status, time on site)

**PostTaskScreen:**
- Add "Use My Location" button on step 3 → calls expo-location
- Show work window times on step 4 confirm

**WorkerHomeScreen:**
- Add Online/Offline/Busy toggle in header

**Expected result:** Sprint 3 is truly complete per PDF spec.

---

### PHASE 4: Sprint 4 — Supervisor + Citizen + Profile (1-2 sessions)
**Why fourth:** These are the last major screens. After this the app is feature-complete.

**SupervisorHomeScreen (rebuild from placeholder):**
- Full-screen MapView
- Zone polygon overlays using `ZoneOverlay` component
- Color-coded by dirty level (green=CLEAN, yellow=LIGHT, orange=MEDIUM, red=HEAVY, dark=CRITICAL)
- Zone list in bottom sheet
- Tap zone → ZoneDetailScreen

**ZoneDetailScreen (new — replace ZonesScreen placeholder):**
- Zone name, assigned supervisor
- Current dirty level badge
- Tasks in this zone (using TaskCard)
- Last inspected date
- "Inspect Now" button → InspectZoneScreen

**InspectZoneScreen (new):**
- Dirty level selector (5 options)
- Photo capture
- Notes field
- Submit → PATCH /supervisor/zones/:id/inspect
- Auto-creates task if MEDIUM+

**ProfileScreen (real data, replace placeholder):**
- Connect to GET /auth/me
- Worker: tasks completed, average rating, total earned (formatMoney)
- Buyer: tasks posted, total spent
- Citizen: reports submitted, resolved count
- Edit name/phone
- Logout

**CitizenHomeScreen + CreateReportScreen (verify completeness):**
- Check if existing files are real or placeholder
- Complete if needed per PDF spec

**Sprint 4 Tests:**
- `profile.screen.test.tsx`
- `supervisor-home.screen.test.tsx`
- `create-report.screen.test.tsx`

---

### PHASE 5: Sprint 5 Polish (1 session)
**What to do:**
- Replace all `ScrollView + .map()` with `FlatList` in task lists
- Add `@sentry/react-native` crash reporting (30 min, 1 line of setup)
- Image compression before upload (expo-image-manipulator)
- React Query stale times configured per screen
- Error boundaries on all 5 navigators
- `eas build --platform android` → production APK

---

## SESSION SEQUENCE (Recommended)

```
Session N+1:  Fix CI (backend seed endpoint + Maestro flows green)
Session N+2:  Build all shared components + hooks
Session N+3:  Fill Sprint 3 gaps (StatusTimeline, AIScoreCard, LiveTrack improvements)
Session N+4:  Sprint 4 Part 1 (ProfileScreen + Citizen screens)
Session N+5:  Sprint 4 Part 2 (Supervisor screens — SupervisorHome + ZoneDetail + InspectZone)
Session N+6:  Sprint 5 polish + eas build production APK
```

**Estimated sessions to feature-complete + production APK: 6 sessions**

---

## CI STATUS AT START OF NEXT SESSION
- Jest Tests: ✅ 109 passing
- Maestro E2E: ❌ Failing (login hits Railway, test accounts not seeded properly)
- Debug run 23676898180: ❌ Failed at debug step (curl JSON quoting bug)
- Latest push: `debug: add detailed CI diagnostics for login failure`

## KEY DECISIONS ALREADY MADE (don't revisit)
- react-native-maps (not Mapbox) ✅
- expo-linear-gradient shimmed with View (CI fix) — use real LinearGradient in EAS prod build
- Single role per user (not multi-role) ✅
- GPS via socket.emit not HTTP ✅
- Timer from server startedAt not useState ✅
