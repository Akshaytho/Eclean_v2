# eClean v2 — Full Security Audit Report

> **Date:** April 2, 2026
> **Auditor:** Claude (Penetration Test Simulation)
> **Scope:** Backend + Mobile + Business Logic
> **Mindset:** Attacker trying to steal money, fake work, crack the app

---

## EXECUTIVE SUMMARY

| Severity | Backend | Mobile | Business Logic | TOTAL |
|----------|---------|--------|----------------|-------|
| CRITICAL | 4 | 3 | 1 | **8** |
| HIGH | 6 | 6 | 3 | **15** |
| MEDIUM | 7 | 10 | 4 | **21** |
| LOW | 4 | 5 | 2 | **11** |
| **TOTAL** | **21** | **24** | **10** | **55** |

### Top 5 "I Would Exploit These First" (Attacker Priority)

1. **Payment Amount Mismatch** — Pay Rs 1, get Rs 180 worth of work done (CRITICAL)
2. **Debug Endpoint Exposed** — No auth, triggers AI on any task (CRITICAL, one-line fix)
3. **No Certificate Pinning** — MitM all traffic, steal tokens, modify requests (CRITICAL)
4. **GPS Spoofing** — Fake location to accept/start tasks from anywhere (CRITICAL)
5. **Buyer Cancel After Work Done** — Get free cleaning, full refund (CRITICAL)

---

## PART 1: BACKEND VULNERABILITIES

### CRITICAL

#### 1. Payment-Order Amount Mismatch — STEAL MONEY
- **Files:** `backend/src/modules/tasks/tasks.service.ts:108-139`, `backend/src/modules/payments/payment.routes.ts`
- **Attack:** Buyer creates Razorpay order for Rs 1 → pays Rs 1 → creates task with `rateCents=18000` (Rs 180). Server verifies Razorpay signature is valid but NEVER checks that the Razorpay order amount matches `rateCents`. Worker does Rs 180 worth of work. Platform pays Rs 162 (after 10% fee). Buyer paid Rs 1. Platform bleeds Rs 161 per task.
- **Fix:** In `createTask`, after signature verification, fetch the Razorpay order by `razorpayOrderId` and assert `order.amount === rateCents`.

#### 2. Unauthenticated Debug Endpoint
- **File:** `backend/src/app.ts:95-101`
- **Attack:** `GET /debug/reverify?taskId=<any-id>` has NO auth, NO rate limit. Attacker can drain AI API budget, manipulate scores by re-triggering verification after swapping photos, enumerate task IDs.
- **Fix:** Delete this endpoint. It's marked "TEMP debug -- remove before production" but is live.

#### 3. Webhook Signature Bypass in Dev Mode
- **File:** `backend/src/modules/payouts/payouts.routes.ts:152-163`
- **Attack:** When `RAZORPAY_WEBHOOK_SECRET` is unset AND `NODE_ENV !== production`, signature verification is skipped. If Railway accidentally deploys with wrong NODE_ENV, attacker can forge webhooks to mark payouts as COMPLETED (steal money) or FAILED (deny workers).
- **Fix:** Default to rejecting webhooks unless secret is configured, regardless of NODE_ENV.

#### 4. Double Refund Race Condition
- **File:** `backend/src/modules/tasks/tasks.service.ts:265-281`
- **Attack:** Refund logic runs OUTSIDE the serializable transaction. Two concurrent cancel requests both pass the check, both call `refundPayment()`. Buyer gets refunded twice for one payment.
- **Fix:** Move refund inside the transaction, or use Redis lock on paymentId, or add `refundedAt` column set atomically.

### HIGH

#### 5. Refresh Token Not Rate Limited
- **File:** `backend/src/modules/auth/auth.routes.ts:62`
- **Attack:** Unlike `/login` (10/min) and `/register` (5/hr), `/refresh` has zero rate limiting. Stolen refresh token = unlimited access tokens.
- **Fix:** Add `max: 30/minute` rate limit.

#### 6. Logout Endpoint Unauthenticated
- **File:** `backend/src/modules/auth/auth.routes.ts:79-94`
- **Attack:** No `authenticate` preHandler. Anyone can blacklist arbitrary JWTs, fill Redis with blacklist entries.
- **Fix:** Require auth, only allow blacklisting caller's own tokens.

#### 7. No Duplicate Payout Protection
- **Files:** `backend/src/modules/tasks/tasks.service.ts` (approveTask), `backend/src/jobs/payment-release.job.ts`
- **Attack:** Manual approval and auto-release job can fire simultaneously → two payout records for one task.
- **Fix:** Unique constraint on `Payout.taskId` or check for existing payouts in auto-release.

#### 8. Worker Sees Full Details of Any OPEN Task (IDOR)
- **File:** `backend/src/modules/tasks/tasks.service.ts:526-537`
- **Attack:** Any worker can view full details (locationLogs, events, media, buyer info) of any OPEN task.
- **Fix:** Restrict detail endpoint for non-assigned tasks to limited fields.

#### 9. Chat XSS (Stored)
- **File:** `backend/src/realtime/socket.ts:170-218`
- **Attack:** Chat messages stored with only `trim()`. No HTML sanitization. If admin panel renders as HTML → full XSS.
- **Fix:** Strip HTML tags before storage, enforce CSP on all clients.

#### 10. Webhook Raw Body Fallback
- **File:** `backend/src/modules/payouts/payouts.routes.ts:167`
- **Attack:** Falls back to `JSON.stringify(body)` if rawBody missing. Different byte sequence could cause legitimate webhooks to fail or forged signatures to pass.
- **Fix:** Always require rawBody, reject if missing.

### MEDIUM

| # | Issue | File |
|---|-------|------|
| 11 | No email verification before tasks | auth.service.ts |
| 12 | CI seed creates prod accounts with Test@1234 | ci.routes.ts |
| 13 | Registration allows unrestricted role selection | auth.schema.ts |
| 14 | No account lockout (14,400 attempts/day per IP) | auth.routes.ts |
| 15 | Availability toggle has no Zod validation | tasks.controller.ts:184-191 |
| 16 | Rating allows re-rating (no idempotency) | tasks.service.ts:990-1009 |
| 17 | CORS allows all origins in non-production | app.ts:46 |

### LOW

| # | Issue | File |
|---|-------|------|
| 18 | Password reset token no rate limit | auth.service.ts:189 |
| 19 | Task ID schema accepts any string (not UUID) | tasks.schema.ts:73 |
| 20 | Error messages leak internal state in dev | error-handler.ts:46 |
| 21 | Notification read reveals valid IDs via 404/403 | notifications.routes.ts:47 |

---

## PART 2: MOBILE VULNERABILITIES

### CRITICAL

#### 22. No Certificate Pinning — ENABLES ALL OTHER ATTACKS
- **File:** `mobile/src/api/client.ts` (entire file)
- **Attack:** Standard HTTPS with zero cert pinning. Rooted device + mitmproxy = intercept ALL traffic, steal tokens, modify requests, replay attacks.
- **Fix:** Implement SSL pinning via `react-native-ssl-pinning`. Pin to Railway deployment cert.

#### 23. GPS Spoofing — Client-Side Geofence Only
- **File:** `mobile/src/hooks/useGeofence.ts` (entire file)
- **Attack:** Geofence is pure client-side haversine. Worker with FakeGPS app can accept/start tasks anywhere on earth. GPS coords sent to server are self-reported.
- **Fix:** Server-side GPS verification, speed/distance anomaly detection, wire in environmental DNA.

#### 24. Unvalidated Socket GPS Emissions
- **File:** `mobile/src/stores/socketStore.ts:109-111`
- **Attack:** `emitGPS(taskId, lat, lng, accuracy)` accepts any values. Attacker with stolen token connects custom socket client, emits perfect GPS trail while sitting at home.
- **Fix:** GPS data signing with device key, include accelerometer/barometer data, server-side anomaly detection.

### HIGH

#### 25. Photo Metadata Fully Client-Supplied
- **File:** `mobile/src/api/media.api.ts:54-60`
- **Attack:** `capturedLat`, `capturedLng`, `capturedAt`, `deviceId`, `photoHash` all self-reported. EXIF stripped by compression. Worker uploads stock photo with fabricated metadata.
- **Fix:** Server-side EXIF extraction BEFORE compression, cross-reference EXIF GPS with client GPS.

#### 26. CaptureCamera Bypassed via Direct API Calls
- **File:** `mobile/src/components/camera/CaptureCamera.tsx`
- **Attack:** Camera takes live photos and computes SHA-256, but attacker calls `POST /tasks/:id/media` directly with pre-saved image and fake hash.
- **Fix:** Server-side SHA-256 recomputation + photo forensics (JPEG ELA).

#### 27. Environmental DNA NOT Wired Into Worker Flow
- **File:** `mobile/src/hooks/useEnvironmentalDNA.ts`
- **Attack:** Brilliant anti-spoofing mechanism (magnetometer, barometer, ambient light, cell network) exists but only used in PostTaskScreen (buyer). Workers never captured.
- **Fix:** Capture env DNA at task start, photo capture, and submit. Compare buyer vs worker DNA server-side.

#### 28. Submit Without Photos Possible (Client)
- **File:** `mobile/src/screens/worker/SubmitProofScreen.tsx:76-86`
- **Attack:** `handleSubmit` calls API with NO client-side photo completeness check. Checklist is cosmetic only.
- **Fix:** Disable submit button until server confirms required media exists.

#### 29. Start Task Without Valid GPS
- **File:** `mobile/src/screens/worker/ActiveTaskScreen.tsx:138-140`
- **Attack:** `startMutation` sends `currentLocation` which may be undefined → sends empty object → server geofence check skipped.
- **Fix:** Make GPS required client-side, validate server-side.

#### 30. Socket Auth Theft
- **File:** `mobile/src/stores/socketStore.ts:41`
- **Attack:** Socket auth is just the access token. With MitM (no cert pinning), attacker steals token, connects custom client, joins any task room, sends fake GPS, impersonates user in chat.
- **Fix:** Certificate pinning fixes the root cause.

### MEDIUM

| # | Issue | File |
|---|-------|------|
| 31 | No proactive token expiry check | api/client.ts |
| 32 | HTTP URLs in config comments | constants/config.ts |
| 33 | Gallery metadata stored as plain JSON | services/galleryService.ts:118-123 |
| 34 | Photo hash fallback is predictable | camera/CaptureCamera.tsx:100-101 |
| 35 | Geofence radius is client-side constant (2km) | ActiveTaskScreen.tsx:50 |
| 36 | Test accounts documented with passwords | CLAUDE.md section 8 |
| 37 | EAS project ID exposed in app.json | app.json:107 |
| 38 | Offline queue items editable on rooted device | services/offlineSync.ts:31 |
| 39 | Console.warn in production code | multiple files |
| 40 | Razorpay key ID exposed to WebView | payment/RazorpayCheckout.tsx:60 |

### LOW

| # | Issue | File |
|---|-------|------|
| 41 | Deep link surface limited (safe) | navigation/linking.ts |
| 42 | Device fingerprint sent with photos | camera/CaptureCamera.tsx:109 |
| 43 | Sentry org/project names exposed | app.json:86-89 |
| 44 | Offline queue max 50 (DoS potential) | services/offlineSync.ts:20 |
| 45 | Chat route depends on client-side role | screens/shared/ChatScreen.tsx:32-34 |

---

## PART 3: BUSINESS LOGIC VULNERABILITIES

### CRITICAL

#### 46. Buyer Cancels IN_PROGRESS Task — STEALS FREE LABOR
- **Files:** `backend/src/modules/tasks/tasks.state-machine.ts:15`, `backend/src/modules/tasks/tasks.service.ts:214-293`
- **Attack:** Worker accepts task, starts cleaning, uploads photos. Buyer fires cancel while task is still IN_PROGRESS (before submit reaches server). Buyer gets full refund. Worker loses time and effort with zero payment.
- **Fix:** Remove BUYER from `IN_PROGRESS → CANCELLED` transition, or charge cancellation fee (50% of rate) once work starts.

### HIGH

#### 47. No Minimum Time Before Submit
- **File:** `backend/src/modules/tasks/tasks.service.ts:776-864`
- **Attack:** Worker starts task, immediately uploads pre-prepared photos, submits in 5 seconds. `timeOnSiteLayer` lowers score but doesn't BLOCK submission. AI might still pass it. Auto-release at 72h pays the worker.
- **Fix:** Server-side minimum time enforcement (5min LIGHT, 10min MEDIUM, 15min HEAVY, 20min CRITICAL). Block submission below threshold.

#### 48. Geofence Bypass — Optional GPS on Start
- **File:** `backend/src/modules/tasks/tasks.schema.ts:79-85`
- **Attack:** `startTaskSchema` uses `z.preprocess((val) => val ?? {}, ...)` — both lat/lng are optional. Worker sends empty body `{}`, geofence check at line 626-638 is completely skipped. Worker starts task from anywhere.
- **Fix:** Make lat/lng REQUIRED in startTaskSchema, or enforce via recent TaskLocationLog entries.

#### 49. Auto-Release Exploits Inactive Buyers
- **File:** `backend/src/jobs/payment-release.job.ts:28-33, 40-142`
- **Attack:** Worker does minimal work, gets MANUAL_REVIEW score. Buyer never opens app. After 72h, auto-release approves and pays. The "24h dispute window" in the notification text is NOT actually implemented — no code enforces it.
- **Fix:** For MANUAL_REVIEW with AI score < 0.50, escalate to admin instead of auto-releasing. Implement the dispute window.

### MEDIUM

| # | Issue | File |
|---|-------|------|
| 50 | Worker cancel doesn't clean media — piggyback attack | tasks.service.ts:717-772 |
| 51 | Rating allows re-rating (no dedup) | tasks.service.ts:990-1009 |
| 52 | Disputes lock funds indefinitely — no resolution timeout | tasks.state-machine.ts:18-20 |
| 53 | Legacy flow accepts garbage images | tasks.service.ts:811-817 |

### LOW

| # | Issue | File |
|---|-------|------|
| 54 | Task expiry doesn't clean up media records | jobs/task-expiry.job.ts:52-55 |
| 55 | Webhook secret not enforced in dev | payouts.routes.ts:152-163 |

---

## WHAT'S WELL DEFENDED (Credit)

The codebase has strong foundations:
- **Serializable transactions everywhere** — prevents most TOCTOU races
- **Double-accept prevention** — two workers cannot accept same task
- **Payment signature verification** — Razorpay HMAC-SHA256 with timing-safe comparison
- **AI fallback is safe** — failure defaults to MANUAL_REVIEW, never auto-passes
- **Payout idempotency** — `jobId: payout_${payoutId}` prevents duplicate payout jobs
- **Idempotency-key on media uploads** — prevents duplicate photos
- **Role-based authorization** — clean middleware chain
- **Tokens in SecureStore** — not AsyncStorage
- **Token refresh with queue** — prevents multiple simultaneous refreshes

---

## RECOMMENDED FIX ORDER

### Phase 1 — Do TODAY (money at risk)
1. Delete `/debug/reverify` endpoint (1 minute fix)
2. Fix payment amount mismatch — verify Razorpay order amount matches rateCents
3. Move refund logic inside serializable transaction (double refund fix)
4. Make lat/lng REQUIRED in startTaskSchema (geofence bypass fix)
5. Enforce webhook signature verification regardless of NODE_ENV

### Phase 2 — This Week (serious exploits)
6. Remove BUYER from IN_PROGRESS→CANCELLED, or add cancellation fee
7. Add minimum time enforcement before submit
8. Add duplicate payout protection (unique constraint on Payout.taskId)
9. Rate limit /refresh endpoint
10. Authenticate /logout endpoint
11. Don't auto-release MANUAL_REVIEW tasks with AI score < 0.50
12. Server-side SHA-256 recomputation for uploaded photos

### Phase 3 — This Sprint (hardening)
13. Implement certificate pinning (mobile)
14. Wire environmental DNA into worker task flow
15. Server-side GPS anomaly detection
16. Sanitize chat messages (XSS prevention)
17. Add account lockout after N failed attempts
18. Clean up media on worker cancel and task expiry
19. Add dispute resolution timeout
20. Server-side EXIF extraction before compression

### Phase 4 — Before Public Launch
21. Email verification for critical actions
22. Disable CI seed endpoint in production
23. Add identity verification (KYC) for workers
24. Strip console.warn in production builds
25. Restrict CORS origins in all environments
