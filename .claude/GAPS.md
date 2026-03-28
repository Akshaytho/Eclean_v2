# eClean v2 — Master Gaps & Solutions Registry

> **HOW THIS FILE WORKS**
>
> Every Claude session that works on a sprint, feature, or fix should:
> 1. Read this file at session start
> 2. Pick ONE `[ ]` item that is RELEVANT to what the user is working on (same domain — don't add a security task while doing UI work)
> 3. Add it as a sub-task at the bottom of the current work WITHOUT disrupting the main task
> 4. Mark it `[x]` + add completion date when done
> 5. Never pick more than one gap per session
>
> **Priority levels:** 🔴 Critical (blocks launch) | 🟡 Important (needed for real users) | 🟢 Nice to have

---

## 1. SECURITY

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| S1 | [ ] | 🔴 | Backend URL hardcoded in `app.json` — visible in decompiled APK | Move to EAS environment variable `EXPO_PUBLIC_API_URL`, inject at build time via `eas.json` |
| S2 | [ ] | 🔴 | No rate limiting on auth endpoints — brute force possible | Add `@fastify/rate-limit` — 5 attempts/15min on `/auth/login`, 3/hour on `/auth/register` |
| S3 | [ ] | 🔴 | No API authentication for mobile→backend — anyone can hit your API | Add `x-app-key` header check in Fastify middleware, key stored in EAS secret |
| S4 | [ ] | 🟡 | JWT refresh token not implemented — users force-logged-out when token expires | Add refresh token endpoint, store refresh token in SecureStore, auto-refresh in Axios interceptor |
| S5 | [ ] | 🟡 | No certificate pinning — MITM attacks possible | Add `expo-build-properties` SSL pinning config for production builds |
| S6 | [ ] | 🟡 | Worker GPS coordinates stored forever — privacy risk + storage cost | Add TTL cleanup job: delete `TaskLocationLog` older than 90 days (extend existing 3am job) |
| S7 | [ ] | 🟡 | No input sanitisation on report/task descriptions — XSS/injection risk | Add `zod` schema validation on all POST body inputs in Fastify routes |
| S8 | [ ] | 🔴 | GitHub PAT exposed in Claude session history chat logs | **Revoke at github.com/settings/tokens** — generate new token, store only in GitHub Secrets, never paste in chat |

---

## 2. INFRASTRUCTURE & DEPLOYMENT

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| I1 | [ ] | 🔴 | Railway free tier sleeps after inactivity — cold starts break CI and real users | Upgrade to Railway Starter ($5/mo) OR add UptimeRobot ping every 5 mins to keep alive |
| I2 | [ ] | 🔴 | No database backups — Postgres data loss = game over | Enable Railway automated backups (paid) OR add daily `pg_dump` to S3/Cloudflare R2 via cron |
| I3 | [ ] | 🔴 | No staging environment — all pushes go straight to production | Create `staging` branch → Railway staging service → separate DB → `eas build --profile preview` |
| I4 | [ ] | 🟡 | No health monitoring — app crashes at 2am, nobody knows | Add UptimeRobot (free) monitoring `ecleanfuture-production.up.railway.app/health` with Telegram alert |
| I5 | [ ] | 🟡 | Images served directly from Cloudinary — no CDN caching strategy | Enable Cloudinary's built-in CDN delivery, add `f_auto,q_auto` transformations to all image URLs |
| I6 | [ ] | 🟡 | No Redis persistence config — Redis data lost on Railway restart | Set `save 900 1` in Redis config OR switch to Railway Redis with persistence enabled |
| I7 | [ ] | 🟢 | Single Railway region (US) — high latency for India users | Add Railway Mumbai region OR put Cloudflare proxy in front for edge caching |

---

## 3. LEGAL & COMPLIANCE

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| L1 | [ ] | 🔴 | No Privacy Policy — mandatory for Play Store + DPDP Act 2023 | Write privacy policy covering: GPS data, photos, payment info, retention periods. Host at `eclean.in/privacy` |
| L2 | [ ] | 🔴 | No Terms of Service — no legal protection if disputes arise | Write ToS covering worker/buyer responsibilities, payment terms, dispute resolution. Host at `eclean.in/terms` |
| L3 | [ ] | 🔴 | No in-app consent for location tracking — DPDP Act 2023 requirement | Add consent screen on first launch before requesting location permission, store consent timestamp |
| L4 | [ ] | 🔴 | No data deletion flow — DPDP Act requires "right to erasure" | Add "Delete My Account" in ProfileScreen → soft-delete user, anonymize GPS/photos, purge tokens |
| L5 | [ ] | 🟡 | Razorpay marketplace payments require RBI Payment Aggregator license | Short term: manual payouts to workers. Long term: apply for PA license (6-12 months). Document this decision |
| L6 | [ ] | 🟡 | No worker KYC — fake workers can accept tasks | Add Aadhaar/PAN verification step in worker onboarding (use DigiLocker API or manual upload) |
| L7 | [ ] | 🟢 | No age verification — app should restrict under-18 workers | Add DOB field in worker registration, block if under 18 |

---

## 4. APP STORE READINESS

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| A1 | [ ] | 🔴 | No Play Store listing setup — can't distribute officially | Create Google Play Console account ($25 one-time), set up app listing, upload screenshots |
| A2 | [ ] | 🔴 | No app signing keystore for production — CI builds are debug APKs | Generate keystore, store in EAS secrets, configure `eas.json` production profile |
| A3 | [ ] | 🔴 | Data Safety form not filled — mandatory for Play Store | Declare: Location (precise, background), Photos, Name, Email, Payment info in Play Console |
| A4 | [ ] | 🟡 | No app icon for all densities — current icon may not pass review | Generate all required sizes (48/72/96/144/192px) + adaptive icon for Android 8+ |
| A5 | [ ] | 🟡 | No Play Store screenshots — needed for listing | Take screenshots on real device: onboarding, login, worker home, buyer home, map view |
| A6 | [ ] | 🟢 | No iOS build configured — locked to Android only | Add iOS EAS profile, Apple Developer account ($99/year), configure provisioning profiles |

---

## 5. MONITORING & OBSERVABILITY

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| M1 | [ ] | 🔴 | No crash reporting — production crashes are invisible | Add Sentry React Native: `npx @sentry/wizard -i reactNative` — 30 min setup, free tier |
| M2 | [ ] | 🟡 | No backend error tracking — Fastify errors swallowed silently | Add Sentry Node SDK to Fastify: `@sentry/node` with `requestHandler` and `errorHandler` |
| M3 | [ ] | 🟡 | No API analytics — don't know which endpoints are slow or failing | Add Fastify `pino` structured logging + ship logs to Better Stack (free tier) or Logtail |
| M4 | [ ] | 🟡 | No user analytics — don't know where users drop off | Add PostHog React Native (open source, self-hostable, GDPR compliant) — track screen views |
| M5 | [ ] | 🟢 | No performance monitoring — slow API calls not detected | Add `@sentry/tracing` with `BrowserTracing` for API call performance traces |

---

## 6. MISSING APP SCREENS & FEATURES

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| F1 | [ ] | 🔴 | Citizen role has NO screens — biggest differentiation gap | Build Sprint 4: CitizenHomeScreen, CreateReportScreen (photo + GPS + category) |
| F2 | [ ] | 🔴 | Supervisor role has NO screens — can't manage zones | Build Sprint 4: SupervisorHomeScreen (zone map), ZoneDetailScreen, InspectZoneScreen |
| F3 | [ ] | 🔴 | ProfileScreen shows no real data — static placeholder | Connect to `GET /auth/me` — show tasks completed, rating, earnings for workers; posted/spent for buyers |
| F4 | [ ] | 🟡 | StatusTimeline component missing — buyers can't see task progress visually | Build `StatusTimeline.tsx` — OPEN→ACCEPTED→IN_PROGRESS→SUBMITTED→APPROVED with timestamps |
| F5 | [ ] | 🟡 | AIScoreCard component missing — AI verification score not shown | Build `AIScoreCard.tsx` — score number + EXCELLENT/GOOD/UNCERTAIN/POOR badge + reasoning text |
| F6 | [ ] | 🟡 | No offline mode — app breaks with no internet | Build `useOfflineQueue.ts` — queue mutations in MMKV, retry on reconnect via NetInfo |
| F7 | [ ] | 🟡 | No push notifications for real events — users miss task updates | Wire up Expo Notifications: task accepted, submitted, approved, rejected — backend already sends |
| F8 | [ ] | 🟡 | Worker status toggle missing — can't go Online/Offline/Busy | Add status toggle to WorkerHomeScreen header — updates backend, changes task visibility |
| F9 | [ ] | 🟡 | No dispute resolution flow — buyer rejects, worker disagrees | Add "Dispute" button on RatingScreen → creates support ticket → admin resolves in admin panel |
| F10 | [ ] | 🟢 | No admin panel — can't manage users/zones/disputes from web | Build simple Next.js admin dashboard: user list, zone management, dispute queue |
| F11 | [ ] | 🟢 | No worker earnings analytics — workers can't see weekly/monthly trends | Add chart to WalletScreen — daily earnings bar chart using `react-native-gifted-charts` |
| F12 | [ ] | 🟢 | No in-app chat push notifications — messages missed | Add socket `chat:message` → Expo push notification when app is backgrounded |

---

## 7. PERFORMANCE & SCALABILITY

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| P1 | [ ] | 🟡 | FlatList not used everywhere — long lists cause memory issues | Replace all `ScrollView + map()` in task lists, notifications, wallet with `FlatList` |
| P2 | [ ] | 🟡 | Images not compressed before upload — large files slow everything | Add `expo-image-manipulator` — resize to max 1200px, compress to 80% before Cloudinary upload |
| P3 | [x] | 🟡 | React Query stale times not tuned — too many refetches | activeTask: 5s, taskList: 30s, notifications: 60s, profile: 5min, wallet: 2min |
| P4 | [ ] | 🟢 | No pagination on task lists — will break at 1000+ tasks | Add cursor-based pagination to `GET /tasks` — already supported in backend, needs frontend |
| P5 | [ ] | 🟢 | Socket reconnection not robust — drops after phone sleep | Add exponential backoff in `socketStore` reconnect logic, restore subscriptions after reconnect |

---

## 8. CI/CD & TESTING

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| C1 | [ ] | 🔴 | Maestro flows fail because login hits real backend — flaky CI | Create `/api/v1/ci/seed` endpoint (CI_SECRET header required) that creates test accounts idempotently |
| C2 | [ ] | 🟡 | No Maestro flows for Citizen/Supervisor — Sprint 4 untested | Write `11_citizen_report.yaml`, `12_supervisor_inspect.yaml` when screens are built |
| C3 | [ ] | 🟡 | Sprint 3 screen tests not written — buyer flow untested | Write `buyer-home.screen.test.tsx`, `post-task.screen.test.tsx`, `buyer-task-detail.screen.test.tsx` |
| C4 | [ ] | 🟡 | No E2E test with real 2-phone scenario from PDF Part 5 | Set up real device farm test: buyer posts → worker accepts → completes → buyer approves |
| C5 | [ ] | 🟢 | Build time is ~17 mins — too slow for fast iteration | Pre-build android/ folder and cache it properly, or switch to EAS Build remote builds |

---

## 9. DATA MONETISATION (Your Differentiator)

| # | Status | Priority | Problem | Solution |
|---|--------|----------|---------|----------|
| D1 | [ ] | 🟡 | No anonymization pipeline for GPS data before monetisation | Build data export job: strip worker IDs, aggregate by zone, output as GeoJSON for municipal APIs |
| D2 | [ ] | 🟡 | No "dirty level" scoring per zone — the core intelligence product | Build zone scoring: weight citizen reports + task frequency + AI rejection rate → dirty score 0-100 |
| D3 | [ ] | 🟡 | No API for municipal corporations to query zone data | Build `GET /api/v1/data/zones?from=&to=` with API key auth — this is your B2B product |
| D4 | [ ] | 🟢 | No dashboard for municipalities to visualise zone health | Build Mapbox-powered web dashboard showing zone dirty scores as heatmap |
| D5 | [ ] | 🟢 | AI photo verification score not stored long-term for trend analysis | Store AI scores with timestamps in `TaskAIScore` table, expose in zone analytics |

---

## COMPLETION LOG

<!-- Claude updates this section when a gap item is completed during a session -->

| Date | Gap ID | What was done | Session context |
|------|--------|---------------|-----------------|
| — | — | — | — |
| 2026-03-28 | P3 | React Query stale times tuned in QueryClient + per-screen via staleTime | Session 2 — components + hooks |

---

## RULES FOR CLAUDE READING THIS FILE

```
RULE 1 — ONE GAP PER SESSION
  Never add more than one gap task to the current session's work.

RULE 2 — RELEVANCE MATCHING
  Only pick gaps relevant to the current work domain:
  - Working on UI screens → pick from section 6 (Features)
  - Working on CI/CD → pick from section 8
  - Working on backend → pick from sections 2, 5, 7
  - Working on sprint → pick from section 6 matching that sprint's domain
  Never pick from Security or Legal mid-sprint unless user asks

RULE 3 — NON-DISRUPTIVE
  Add gap task AFTER completing the main task, not before.
  Format: "🔧 Gap task from GAPS.md [{ID}]: {description}"

RULE 4 — UPDATE ON COMPLETION
  When a gap item is completed, mark [x] and add to COMPLETION LOG.

RULE 5 — DON'T FORCE IT
  If no gap is naturally relevant to current work, skip it.
  Never pick a gap that would require significant extra time.
```
