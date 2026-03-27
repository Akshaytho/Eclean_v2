# eClean — Claude Code Master Instructions

> **Auto-update this file when:** new coding rule added, session protocol changes, tech stack changes, production URLs change, or new conventions established.

---

## 1. MANDATORY SESSION PROTOCOL

### Every Session START (do this before touching any code):
```bash
# 1. Start services
open -a "Docker Desktop" && sleep 15
docker compose up -d
sleep 5

# 2. Start backend (local, port 3000)
cd backend && npm run dev &
sleep 5
```
Note: Dev frontend on port 3001 (production API) can run separately for manual testing.

### Every Session END (do this before closing):
```bash
cd backend && npm test
```
Report pass/fail count to user. Fix any failures before closing.

> **Note:** Playwright is now admin-only. Do NOT run the full 81-test suite. If testing admin flows, run only `frontend/e2e/` admin-related specs.

### Mobile (Maestro) Testing — run when changing eclean-mobile code:
```bash
# 1. Start Android emulator headlessly
export ANDROID_HOME=/usr/local/share/android-commandlinetools
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
emulator -avd eclean_test -no-window -no-audio -gpu host -memory 1024 &
# Wait for boot (~30s from snapshot), then:
adb reverse tcp:8081 tcp:8081   # Metro
adb reverse tcp:3000 tcp:3000   # Backend

# 2. Start Metro (mobile JS bundler)
cd eclean-mobile && npx expo start --port 8081 &

# 3. Install APK (only needed if native code changed — otherwise Metro hot-reloads)
adb push android/app/build/outputs/apk/debug/app-debug.apk /data/local/tmp/app-debug.apk
adb shell pm install -r /data/local/tmp/app-debug.apk

# 4. Run Maestro flows (reads screenshots automatically)
~/.maestro/bin/maestro test .maestro/01-auth.yaml
~/.maestro/bin/maestro test .maestro/02-worker-flow.yaml
# etc.
```
**IMPORTANT for Maestro tests:** `constants.ts` must use `http://localhost:3000` (not production URL)
during testing, then restore to `Constants.expoConfig?.extra?.apiUrl` after.

---

## 2. PROJECT OVERVIEW

**eClean** — AI-powered civic work verification platform.
Workers clean public areas → upload before/after photos → Claude Vision AI verifies → payment auto-releases.

**Production URLs:**
| Service | URL |
|---------|-----|
| Backend (Railway) | https://ecleanfuture-production.up.railway.app |
| Frontend (Vercel) | https://eclean-future.vercel.app |
| Health check | https://ecleanfuture-production.up.railway.app/health |

**5 roles:** BUYER · WORKER · SUPERVISOR · ADMIN · CITIZEN

**Tech stack:** Fastify + Prisma + PostgreSQL + Redis + BullMQ + Claude Vision + Cloudinary + Razorpay + Socket.io + React + Vite + Zustand + TanStack Query

**Local ports:** Backend :3000 · Frontend :3001 (dev, production API) · Frontend :3002 (Playwright tests, local API) · PostgreSQL :5433 · Redis :6379

---

## 3. DOCUMENT MAP

> **Auto-update this section when:** a file is added, removed, or changes purpose.

| File | Purpose | Update when |
|------|---------|-------------|
| `CLAUDE.md` | This file — master instructions | New rule, protocol change, stack change |
| `FEATURES.md` | Feature designs, flows, edge cases | Feature changes, user confirms/rejects design |
| `README.md` | Public GitHub readme | Setup steps change, new team member onboards |
| `.claude/SPRINT.md` | Current sprint + history | Sprint ends, new sprint starts |
| `.claude/DECISIONS.md` | Architecture decision records | Major technical decision made |
| `.claude/STRATEGY.md` | Business strategy, growth plan | Strategic direction changes |

**Playwright tests** (`frontend/e2e/`):
- `01-auth.spec.ts` — Login, register, redirects, RBAC
- `02-buyer-flow.spec.ts` — Post task, review, approve
- `03-worker-flow.spec.ts` — Find work, accept, submit proof
- `04-other-roles.spec.ts` — Supervisor, Citizen, Admin
- `05-edge-cases.spec.ts` — Negative cases, invalid inputs, unauthorized access

**Maestro mobile tests** (`eclean-mobile/.maestro/`):
- `01-auth.yaml` — Wrong password error, login, logout, register, forgot password
- `02-worker-flow.yaml` — Login as worker, find task, accept, active task, wallet
- `03-buyer-flow.yaml` — Login as buyer, post task, notifications, profile
- `04-supervisor-flow.yaml` — Login as supervisor, dashboard, notifications, profile
- `05-citizen-flow.yaml` — Login as citizen, submit report, notifications, profile
- `06-edge-cases.yaml` — Empty submit, invalid credentials, logout clears state

**Mobile app** (`eclean-mobile/`): React Native Expo SDK 54, all 5 roles, Android APK at `android/app/build/outputs/apk/debug/app-debug.apk`

**Seeded test accounts** (password: `Test@1234`):
`buyer@eclean.test` · `worker@eclean.test` · `admin@eclean.test` · `citizen@eclean.test` · `supervisor@eclean.test`

---

## 4. BEFORE CHANGING ANY FEATURE

1. Read `FEATURES.md` first — it is the source of truth for all feature designs
2. If a change conflicts with FEATURES.md, ask the user before proceeding
3. Never change confirmed UI designs (role cards, auth flow, etc.) just to make tests pass — update the tests to match the design instead
4. After any feature change, update `FEATURES.md` to reflect it

---

## 5. PRODUCTION RULES (never break these)

> **Auto-update this section when:** a new absolute rule is established.

1. **No hardcoded secrets** — all via `process.env`. Never commit `.env` files.
2. **Money is always integer paise** — ₹10 = `1000`. Never floats. `z.number().int()` on all money fields.
3. **Every payment uses a DB transaction** — `prisma.$transaction()`. No payment logic outside a transaction.
4. **CONFIRM-MIGRATION for destructive SQL** — never run `DROP TABLE` / `DROP COLUMN` without user typing `CONFIRM-MIGRATION`.
5. **Stage specific files only** — never `git add .` or `git add -A`.
6. **All routes have Zod validation** — every request body, query param, path param.
7. **Protected routes use `authenticate` middleware** — never manually decode JWT in handlers.
8. **Never expose sensitive data** — no `passwordHash`, no tokens, no internal IDs in API responses.
9. **BullMQ jobs are idempotent** — safe to run more than once. Use jobId for deduplication.
10. **Cloudinary URLs are always HTTPS** — enforce `secure: true` in SDK config.
11. **Prisma for all queries** — no raw SQL in application code. Exception: parameterized `$queryRaw` for reporting.
12. **Backend error format is `{ error: { code, message } }`** — never `{ message }` at top level.

---

## 6. PRE-COMMIT CHECKLIST

> Run before every commit. If any item fails, fix it first.

**TypeScript**
- [ ] `cd backend && npx tsc --noEmit` — zero errors
- [ ] `cd frontend && npx tsc --noEmit` — zero errors

**Tests**
- [ ] `cd backend && npm test` — all 47 tests pass
- [ ] `cd frontend && npx playwright test` — all 80 tests pass

**Security**
- [ ] No hardcoded secrets or API keys
- [ ] No `.env` file staged (`git status` confirms)
- [ ] Every new route has a Zod schema
- [ ] Every new protected route has `preHandler: [authenticate]`
- [ ] No `passwordHash` or tokens in any API response

**Money**
- [ ] All money fields use `z.number().int().min(0)`
- [ ] No `parseFloat` on monetary values
- [ ] Payment state changes wrapped in `prisma.$transaction()`

**Git**
- [ ] Staged only specific files — never `git add .`
- [ ] Commit message is descriptive

---

## 7. KEY CONVENTIONS

> **Auto-update this section when:** a new pattern is established or a bug reveals a wrong assumption.

- **Password requirements:** 8+ chars, 1 uppercase, 1 digit — enforced on both frontend and backend
- **Auth pages:** use shared design system in `frontend/src/pages/auth/authDesign.tsx`
- **CORS:** allows `localhost` on any port + any local network IP (`172.x`, `192.168.x`, `10.x`)
- **Token refresh:** `/auth/refresh` returns no `user` field — preserve existing user from store on refresh
- **Citizen reports:** backend expects `lat`/`lng` (not `locationLat`/`locationLng`) + required `category` field
- **Worker tasks open endpoint:** uses `radiusKm` param (not `radius`)
- **Buyer task list:** includes `worker { id, name, email }` via Prisma `include`
- **TaskEvent shape:** `{ to, from, action, actor, actorRole, note }` — not `{ event }`
