# eClean Mobile — Sprint Plan

> Updated at end of every session. Checkboxes reflect actual done state.
> PDF Reference: eClean_Mobile_Rewrite_Blueprint.pdf

---

## SPRINT 0 — Foundation + Backend Fixes ✅ COMPLETE

- [x] Fix 1: push.ts — Firebase → Expo Push API
- [x] Fix 2: Socket.io Redis adapter
- [x] Fix 3: Geofence check on startTask
- [x] Fix 4: Chat history cursor pagination
- [x] Fix 5: Redis setex token blacklist — already correct
- [x] Fix 6: TaskLocationLog cleanup job (daily 3am)
- [x] Full mobile folder structure
- [x] api/client.ts — Axios + interceptors + offline detection
- [x] All API files: auth, tasks, media, notifications, citizen, zones, payouts
- [x] All stores: authStore, socketStore, locationStore, activeTaskStore, toastStore
- [x] services/backgroundLocation.ts — expo-task-manager
- [x] services/offlineSync.ts — queue + retry
- [x] Backend: 147/147 tests ✅

---

## SPRINT 1 — Auth Screens + Navigation ✅ COMPLETE

- [x] SplashScreen, OnboardingScreen, LoginScreen, RegisterScreen, ForgotPasswordScreen
- [x] RootNavigator, WorkerNavigator, BuyerNavigator, SupervisorNavigator, CitizenNavigator
- [x] GestureHandlerRootView in App.tsx ✅
- [x] Token in SecureStore ✅
- [x] Socket connect on login, disconnect on logout ✅
- [x] Push permission after login (not on app start) ✅
- [x] TypeScript: 0 errors ✅

---

## SPRINT 2 — Worker Flow ✅ COMPLETE (with minor gaps)

- [x] WorkerHomeScreen — earnings, active task card
- [x] FindWorkScreen — MAP-FIRST, bottom sheet, radius + category filters
- [x] TaskDetailScreen — accept, double-tap prevention via useRef
- [x] ActiveTaskScreen — live map, GPS trail, photo grid, timer from startedAt
- [x] SubmitProofScreen — review photos, submit to backend
- [x] MyTasksScreen — 3 tabs (Active/History with status filter)
- [x] WalletScreen — earnings breakdown, payout list
- [x] useBackgroundLocation hook — expo-task-manager wrapper
- [x] GPS via socket.emit('worker:gps') NOT HTTP ✅
- [x] Timer from server startedAt (survives restart) ✅
- [x] Double-tap prevention on accept (useRef) ✅
- [x] 409 handled (another worker accepted) ✅

### Sprint 2 GAPS (from PDF — fix in Sprint 5 polish):
- [ ] WorkerHomeScreen — Online/Busy status toggle
- [ ] WalletScreen — "Withdraw Coming Soon" button placeholder
- [ ] ActiveTaskScreen — verify photo thumbnail + checkmark renders correctly (needs device)

### Sprint 2 Tests ✅
- [x] Unit: auth.api (4), tasks.api (14), payouts.api (3), authStore (7), activeTaskStore (7) = 35
- [x] Integration: auth (5), tasks (6), wallet (4) = 15
- [x] Screen: task-detail (8), active-task (10), submit-proof (10) = 28

---

## SPRINT 3 — Buyer Flow ✅ BUILT (gaps to fix before Sprint 5)

- [x] BuyerHomeScreen — active tasks, stats, post button
- [x] PostTaskScreen — 4-step wizard (category→details→location→confirm)
- [x] BuyerTasksScreen — 3 tabs (active/review/done)
- [x] BuyerTaskDetailScreen — AI score card, approve/reject, worker info
- [x] LiveTrackScreen — real-time worker GPS via socket
- [x] RatingScreen — 1-5 stars + comment
- [x] ChatScreen — real-time socket (shared worker+buyer)
- [x] NotificationsScreen — list + mark-read
- [x] TypeScript: 0 errors ✅

### Sprint 3 GAPS (from PDF — must fix before Sprint 5):
- [ ] BuyerTaskDetailScreen — StatusTimeline (OPEN→ACCEPTED→IN_PROGRESS→SUBMITTED→APPROVED)
- [ ] BuyerTaskDetailScreen — Photo evidence full-screen tap viewer
- [ ] BuyerTaskDetailScreen — AI Score label badge (EXCELLENT/GOOD/UNCERTAIN/POOR)
- [ ] BuyerTaskDetailScreen — Reject requires reason MIN 10 CHARS (modal)
- [ ] BuyerTaskDetailScreen — socket `task:photo_added` listener
- [ ] BuyerTaskDetailScreen — refetchInterval every 30s for active tasks
- [ ] LiveTrackScreen — animated pulsing worker marker
- [ ] LiveTrackScreen — worker info overlay (name, status, time on site)
- [ ] BuyerTasksScreen — search by title
- [ ] PostTaskScreen — "Use My Location" GPS button on Step 3
- [ ] PostTaskScreen — work window times on Step 4 confirm

### Sprint 3 Tests (to write next session):
- [ ] buyer-home.screen.test.tsx
- [ ] post-task.screen.test.tsx
- [ ] buyer-task-detail.screen.test.tsx
- [ ] live-track.screen.test.tsx

---

## SPRINT 4 — Supervisor + Citizen + Profile ⬜ NOT STARTED

- [ ] ProfileScreen — real stats from GET /auth/me (Worker: tasks/rating/earned, Buyer: posted/spent)
- [ ] CitizenHomeScreen — report list + "Report a Problem" FAB
- [ ] CreateReportScreen — category, urgency, photo, GPS, description
- [ ] SupervisorHomeScreen — zone map with polygon overlays, dirty level colors
- [ ] ZoneDetailScreen — zone info, tasks in zone, last inspected
- [ ] InspectZoneScreen — dirty level selector, photo, notes, auto-create task if MEDIUM+

### Sprint 4 Tests to write:
- [ ] profile.screen.test.tsx
- [ ] create-report.screen.test.tsx
- [ ] supervisor-home.screen.test.tsx

---

## MISSING HOOKS (PDF Part 4 — build during Sprint 4/5):

- [ ] `hooks/useOfflineQueue.ts` — ALL mutations queued (accept, start, submit, chat, GPS)
- [ ] `hooks/useUnreadCount.ts` — notification badge count for tab bar
- [ ] `hooks/useGeofence.ts` — distance check helper (uses haversineKm)
- [ ] `hooks/useSocket.ts` — socket event subscription helper with cleanup

---

## MISSING COMPONENTS (PDF Part 4 — build during Sprint 4/5):

### maps/
- [ ] `WorkerLocationMarker.tsx` — animated pulsing blue dot (reanimated)
- [ ] `LiveTrackingMap.tsx` — reusable map with GPS trail polyline
- [ ] `ZoneOverlay.tsx` — zone boundaries on map

### task/
- [ ] `StatusTimeline.tsx` — visual OPEN→COMPLETE progress
- [ ] `AIScoreCard.tsx` — score number + EXCELLENT/GOOD/UNCERTAIN/POOR badge + reasoning
- [ ] `PhotoUploadGrid.tsx` — reusable 3-box BEFORE/AFTER/PROOF with upload
- [ ] `TaskTimer.tsx` — elapsed time computed from task.startedAt
- [ ] `TaskCard.tsx` — reusable task card (used in multiple list screens)

---

## SPRINT 5 — Polish + Testing + Deploy ⬜ NOT STARTED

- [ ] Fix all Sprint 2/3 gaps listed above
- [ ] Build all missing hooks and components
- [ ] useOfflineQueue: airplane mode → queue → reconnect → processes
- [ ] FlatList for ALL long lists (tasks, notifications, payouts)
- [ ] Image compression before upload (ImageManipulator, max 1200px)
- [ ] Upload progress per photo (individual retry)
- [ ] React Query stale times: activeTask=5s, taskList=30s, notifications=60s, profile=5min
- [ ] Error boundaries on all 5 navigators
- [ ] Sentry React Native SDK for crash reporting
- [ ] Real device E2E test (2 phones, full flow from PDF Part 5)
- [ ] `eas build --platform android` → APK for Play Store
- [ ] Google Maps API key configured
- [ ] All 147 backend tests still green
- [ ] All mobile tests still green

---

## CI/CD STATUS

### Jest Tests (jest-tests.yml)
- **Status: ✅ PASSING on every push**
- Unit: 32 tests | Screen: 62 tests | Integration: 15 tests = 109 total
- Runs on: push to main/develop + PRs

### Maestro E2E (maestro-e2e.yml)
- **Status: 🔄 EAS build step still resolving**
- Jest must pass first (needs: jest job)
- EAS Build → Android Emulator (API 30) → Maestro flows
- Flows: smoke-worker, smoke-buyer, worker-login, buyer-post-task
- Fix applied: removed --output flag, added checks:write permission, polls for build
- Needs: EXPO_TOKEN secret set in GitHub repo ✅ (done by Akshay)
- Needs: EAS projectId in app.json ✅ (a37e68dd-ac01-4ab1-baf1-514998521f50)
