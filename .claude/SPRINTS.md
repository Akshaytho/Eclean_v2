# eClean Mobile — Sprint Plan

> Updated at end of every session. Checkboxes reflect actual done state.

---

## SPRINT 0 — Foundation + Backend Fixes ✅ COMPLETE

### Backend Fixes
- [x] Fix 1: Replace `backend/src/lib/push.ts` — Firebase → Expo Push API
- [x] Fix 2: Add `@socket.io/redis-adapter` to `backend/src/realtime/socket.ts`
- [x] Fix 3: Add geofence check to `startTask` in `backend/src/modules/tasks/tasks.service.ts`
- [x] Fix 4: Add cursor pagination to `getChatHistory`
- [x] Fix 5: Verify Redis `setex` handles token blacklist expiry — already correct, no change
- [x] Fix 6: Add `TaskLocationLog` cleanup BullMQ repeatable job (daily 3am)
- [x] Run `cd backend && npm test` — **47/47 tests pass** ✅

### Mobile Foundation
- [x] Create `mobile/` with package.json, app.json, tsconfig.json, babel.config.js
- [x] Install all dependencies from blueprint (package.json)
- [x] Set up full folder structure
- [x] Configure `app.json` with permissions (background location, camera, notifications)
- [x] Create `mobile/src/api/client.ts` — Axios + interceptors + offline detection
- [x] Create `mobile/src/api/auth.api.ts`, `tasks.api.ts`, `media.api.ts`, `notifications.api.ts`, `citizen.api.ts`, `zones.api.ts`
- [x] Create `mobile/src/stores/authStore.ts` — SecureStore persistence
- [x] Create `mobile/src/stores/socketStore.ts` — reconnection logic
- [x] Create `mobile/src/stores/locationStore.ts`
- [x] Create `mobile/src/stores/activeTaskStore.ts` — timer from startedAt, GPS trail
- [x] Create `mobile/src/stores/toastStore.ts`
- [x] Create `mobile/src/services/backgroundLocation.ts` — expo-task-manager registration
- [x] Create `mobile/src/services/offlineSync.ts` — queue + retry logic
- [x] Create `mobile/src/constants/config.ts`, `colors.ts`, `taskCategories.ts`
- [x] Create `mobile/src/types/index.ts`
- [x] Create `mobile/src/utils/formatMoney.ts`, `timeAgo.ts`, `distance.ts`, `permissions.ts`
- [x] Create `mobile/src/navigation/navigationRef.ts`
- [x] Create `mobile/App.tsx` — entry point with all providers

### Sprint 0 Verification
- [x] `cd mobile && npm install` runs without errors (914 packages)
- [ ] App starts without crash on Android emulator (needs device test)
- [ ] API client hits `/health` endpoint
- [ ] SecureStore reads/writes correctly
- [ ] Socket connects with valid token

---

## SPRINT 1 — Auth Screens + Navigation ✅ COMPLETE

### Screens
- [x] `SplashScreen.tsx` — auto-login or show onboarding
- [x] `OnboardingScreen.tsx` — 3 swipeable slides
- [x] `LoginScreen.tsx` — email + password, error handling
- [x] `RegisterScreen.tsx` — name, email, password, role selection cards
- [x] `ForgotPasswordScreen.tsx`
- [x] Placeholder screens: Worker (4), Buyer (3), Supervisor (2), Citizen (2), Shared (2)

### Navigation
- [x] `RootNavigator.tsx` — auth check → role-based routing (spinner during isLoading)
- [x] `WorkerNavigator.tsx` — 5 tabs: Home, Find Work, My Tasks, Wallet, Profile
- [x] `BuyerNavigator.tsx` — 5 tabs: Home, Post Task, My Tasks, Notifications, Profile
- [x] `SupervisorNavigator.tsx` — 4 tabs: Dashboard, Zones, Alerts, Profile
- [x] `CitizenNavigator.tsx` — 4 tabs: Home, Report, Alerts, Profile
- [x] `usePushNotifications.ts` hook — post-login opt-in
- [x] `App.tsx` updated with real RootNavigator

### TypeScript
- [x] `npx tsc --noEmit` → 0 errors ✅

### Sprint 1 Verification
- [ ] Register as Worker → Worker Home tab (needs device test)
- [ ] Register as Buyer → Buyer Home tab
- [ ] Wrong password → error shown, no crash
- [ ] Kill app → reopen → auto-logged in (no flash)
- [ ] Logout → SecureStore cleared → Login screen
- [ ] Token refresh works silently on 401

---

## SPRINT 2 — Worker Flow (3–4 days)

- [ ] `WorkerHomeScreen.tsx`
- [ ] `FindWorkScreen.tsx` — MAP-FIRST with bottom sheet list
- [ ] `TaskDetailScreen.tsx` — accept with double-tap prevention
- [ ] `ActiveTaskScreen.tsx` — live map, GPS trail, photo grid, timer from `startedAt`
- [ ] `SubmitProofScreen.tsx`
- [ ] `MyTasksScreen.tsx`
- [ ] `WalletScreen.tsx`
- [ ] `useBackgroundLocation.ts` hook
- [ ] Background GPS tracking working (phone locked)
- [ ] GPS via `socket.emit('worker:gps')` NOT HTTP

### Sprint 2 Verification
- [ ] Accept task → status ACCEPTED
- [ ] 409 on double-accept
- [ ] Geofence error when too far from task
- [ ] GPS trail visible on map
- [ ] Background: lock phone → GPS still sending
- [ ] All 3 photos uploaded → submit button enables
- [ ] Timer survives app restart

---

## SPRINT 3 — Buyer Flow (2–3 days)

- [ ] `BuyerHomeScreen.tsx`
- [ ] `PostTaskScreen.tsx` — 4-step wizard
- [ ] `BuyerTaskDetailScreen.tsx` — AI score card, approve/reject
- [ ] `LiveTrackScreen.tsx` — real-time map with worker GPS
- [ ] `BuyerTasksScreen.tsx`
- [ ] `RatingScreen.tsx`

### Sprint 3 Verification
- [ ] MEDIUM task → rateCents = 6000
- [ ] Worker accepts → buyer sees ACCEPTED in real-time (socket)
- [ ] AI score shows real number + reasoning
- [ ] Approve → payout created
- [ ] Double-tap approve → fires once only

---

## SPRINT 4 — Other Roles + Shared Screens (2–3 days)

- [ ] `SupervisorHomeScreen.tsx`
- [ ] `ZoneDetailScreen.tsx`
- [ ] `InspectZoneScreen.tsx`
- [ ] `CitizenHomeScreen.tsx`
- [ ] `CreateReportScreen.tsx`
- [ ] `NotificationsScreen.tsx`
- [ ] `ChatScreen.tsx` — real-time socket chat
- [ ] `ProfileScreen.tsx`

---

## SPRINT 5 — Polish + Testing + Deploy (2–3 days)

- [ ] FlatList for all long lists
- [ ] Image caching for Cloudinary photos
- [ ] React Query stale times configured per screen
- [ ] Error boundaries on all navigators
- [ ] Offline behavior testing (airplane mode)
- [ ] Real device E2E test (2 phones, full flow)
- [ ] `eas build --platform android` → APK
- [ ] All backend tests pass after Sprint 0 fixes
