# eClean — Session Handoff

> Updated at end of EVERY session. This is the source of truth for session continuity.

---

## Last Session: 2026-03-27 (Session 6 — Sprint 3 + Testing + CI/CD)

### Status: SPRINT 3 DONE (with gaps) ✅ | JEST CI GREEN ✅ | MAESTRO CI IN PROGRESS 🔄

### What was completed this session:

**Sprint 3 — Buyer Flow (all screens built):**
1. `mobile/src/screens/buyer/BuyerHomeScreen.tsx` — active tasks, stats, post button
2. `mobile/src/screens/buyer/PostTaskScreen.tsx` — 4-step wizard (category→details→location→confirm)
3. `mobile/src/screens/buyer/BuyerTasksScreen.tsx` — 3-tab list (active/review/done)
4. `mobile/src/screens/buyer/BuyerTaskDetailScreen.tsx` — AI score, approve/reject
5. `mobile/src/screens/buyer/LiveTrackScreen.tsx` — real-time worker GPS map
6. `mobile/src/screens/buyer/RatingScreen.tsx` — 1-5 stars + comment
7. `mobile/src/screens/shared/ChatScreen.tsx` — real-time socket chat
8. `mobile/src/screens/shared/NotificationsScreen.tsx` — with mark-read
9. `mobile/src/navigation/BuyerNavigator.tsx` — wired all new screens
10. `mobile/src/navigation/WorkerNavigator.tsx` — added Chat screen
11. `mobile/src/components/ui/Badge.tsx` — fixed (VERIFIED + COMPLETED, removed AI_REVIEW)
12. `mobile/assets/` — placeholder PNGs (icon, splash, adaptive-icon, notification-icon)
13. `mobile/app.json` — removed google-services.json, added EAS projectId, fixed splash color

**Testing — Full pyramid now running:**
- Unit tests: 32/32 ✅
- Screen tests (RTLN): 62/62 ✅  
- Integration tests (live backend): 15/15 ✅
- **Total: 109 automated tests all green**

**Screen tests written (new this session):**
- `tests/screens/login.screen.test.tsx` — 14 tests (render, validation, login flow, errors, nav)
- `tests/screens/register.screen.test.tsx` — 12 tests (role selection, validation, success, errors)
- `tests/screens/task-detail.screen.test.tsx` — 8 tests (display, accept flow, double-tap, errors)
- `tests/screens/active-task.screen.test.tsx` — 10 tests (ACCEPTED state, start, photos, GPS store)
- `tests/screens/submit-proof.screen.test.tsx` — 10 tests (render, photos, submit, double-tap)

**Backend API confirmed working (live test):**
- Full flow: Register → Post Task → Worker sees → Accept → Start → GPS → Upload 3 Photos → Cloudinary → Submit → AI Verify → Approve → ₹54 payout → Rate ✅

**Bug found and fixed:**
- `PostTaskScreen` was sending wrong `rateCents` — backend auto-calculates, removed from API call

**GitHub Actions CI/CD:**
- `jest-tests.yml` — runs on every push, all 109 tests ✅ PASSING
- `maestro-e2e.yml` — runs Maestro on Android emulator after Jest passes
  - Status: EAS build step still resolving (--output flag fixed, projectId added)
  - Latest fix: removed `--output` flag (only for local builds), added `checks:write` permission
- `mobile/eas.json` — EAS build config (preview profile = APK)
- `mobile/app.json` — EAS projectId: `a37e68dd-ac01-4ab1-baf1-514998521f50`
- `.github/SETUP.md` — instructions for adding EXPO_TOKEN secret

**Maestro E2E flows written (10 flows):**
- 01_worker_login, 02_worker_register, 03_buyer_login_post_task
- 04_worker_find_accept_task, 05_worker_active_task_flow, 06_buyer_review_approve
- 07_chat_realtime, 08_notifications, 09_smoke_all_tabs, 10_smoke_buyer_tabs

### What is NOT yet done (gaps found from PDF blueprint):

**Sprint 2 gaps (from PDF):**
- [ ] `WorkerHomeScreen` — Online/Busy status toggle missing
- [ ] `ActiveTaskScreen` — photo box thumbnail + checkmark when uploaded (needs real device verify)

**Sprint 3 gaps (from PDF):**
- [ ] `BuyerTaskDetailScreen` — StatusTimeline component (OPEN→ACCEPTED→IN_PROGRESS→SUBMITTED→APPROVED)
- [ ] `BuyerTaskDetailScreen` — Photo evidence full-screen tap viewer
- [ ] `BuyerTaskDetailScreen` — AI Score label badge (EXCELLENT/GOOD/UNCERTAIN/POOR)
- [ ] `BuyerTaskDetailScreen` — Reject requires reason MIN 10 CHARS (modal input)
- [ ] `BuyerTaskDetailScreen` — socket listens for `task:photo_added` event
- [ ] `BuyerTaskDetailScreen` — auto-refetch every 30 seconds
- [ ] `LiveTrackScreen` — animated pulsing worker marker (currently static pin)
- [ ] `LiveTrackScreen` — worker info overlay at bottom (name, status badge, time on site)
- [ ] `BuyerTasksScreen` — search by title (TextInput filter)
- [ ] `PostTaskScreen` — "Use My Location" GPS button on Step 3
- [ ] `PostTaskScreen` — work window display on Step 4 confirm

**Missing hooks (from PDF):**
- [ ] `useOfflineQueue.ts` — all mutations queued (accept, start, submit, chat), not just photos
- [ ] `useUnreadCount.ts` — notification badge count for tab bar
- [ ] `useGeofence.ts` — distance check helper
- [ ] `useSocket.ts` — socket event subscription helper

**Missing components (from PDF):**
- [ ] `components/maps/WorkerLocationMarker.tsx` — animated pulsing blue dot
- [ ] `components/maps/LiveTrackingMap.tsx` — reusable map with GPS trail
- [ ] `components/maps/ZoneOverlay.tsx` — zone boundaries
- [ ] `components/task/StatusTimeline.tsx` — visual task progress
- [ ] `components/task/AIScoreCard.tsx` — score + badge + reasoning
- [ ] `components/task/PhotoUploadGrid.tsx` — reusable 3-box grid
- [ ] `components/task/TaskTimer.tsx` — elapsed from startedAt
- [ ] `components/task/TaskCard.tsx` — reusable task card

**Sprint 4 — Not started:**
- [ ] `SupervisorHomeScreen.tsx` — zone map + dirty levels
- [ ] `ZoneDetailScreen.tsx` — zone info + tasks
- [ ] `InspectZoneScreen.tsx` — mark dirty + photo
- [ ] `CitizenHomeScreen.tsx` — report list + status
- [ ] `CreateReportScreen.tsx` — photo + GPS + urgency
- [ ] `ProfileScreen.tsx` — real stats from API (currently placeholder)

### Bugs / Blockers:
- **Maestro EAS build**: `--output` flag removed, now polls for build. May still fail if EAS account not properly linked. Monitor next run.
- **GitHub Token**: `[REVOKED_TOKEN]` — revoke after session
- **Google Maps API key**: placeholder in app.json — maps won't work on Android without real key
- **aiScore = None on submit**: BullMQ AI verification job ran in test/async mode — may need Railway env check for ANTHROPIC_API_KEY

### Next steps (Sprint 4 + fix Sprint 3 gaps):

**Priority 1 — Fix Sprint 3 gaps (1 day):**
1. Add StatusTimeline, AIScoreCard (with label badge), PhotoGrid full-screen to BuyerTaskDetailScreen
2. Add task:photo_added socket listener + 30s refetch to BuyerTaskDetailScreen
3. Add animated pulsing marker + worker info overlay to LiveTrackScreen
4. Add search input to BuyerTasksScreen
5. Add "Use My Location" GPS to PostTaskScreen Step 3
6. Add useUnreadCount hook (notification badge on tab bar)

**Priority 2 — Sprint 4 screens:**
1. ProfileScreen with real stats
2. CitizenHomeScreen + CreateReportScreen
3. SupervisorHomeScreen + ZoneDetailScreen + InspectZoneScreen

**Priority 3 — Write tests for Sprint 3 screens:**
- buyer-home.screen.test.tsx
- post-task.screen.test.tsx
- buyer-task-detail.screen.test.tsx
- live-track.screen.test.tsx

---

## Previous Session: 2026-03-27 (Session 5 — Sprint 2 Complete + Tests)

Sprint 2 all 10 worker files, 46 mobile tests green, backend bug fix (comma-separated status).

---

## Previous Session: 2026-03-27 (Session 4 — Tests + Fixes)

Backend integration tests (147 tests), 4 correctness fixes.

---

## Previous Session: 2026-03-27 (Session 3 — Sprint 1 COMPLETE)

Auth screens + navigation, 0 TS errors.

---

## Previous Session: 2026-03-27 (Session 2 — Sprint 0 COMPLETE)

Backend fixes: push.ts, Redis adapter, geofence, chat pagination, cleanup job.
