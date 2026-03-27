# eClean — Maestro E2E Tests

Real device end-to-end tests. Runs on your actual Android/iOS phone via Expo Go or production APK.

## Setup

```bash
# Install Maestro on your machine
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify install
maestro --version
```

## Create test accounts first

Before running flows, create the test accounts on the live backend:

```bash
curl -X POST https://ecleanfuture-production.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"maestro-worker@eclean.test","password":"Test@1234","name":"Maestro Worker","role":"WORKER"}'

curl -X POST https://ecleanfuture-production.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"maestro-buyer@eclean.test","password":"Test@1234","name":"Maestro Buyer","role":"BUYER"}'
```

## Run flows

```bash
# Make sure your phone is connected via USB + app is running
cd maestro

# Single flow
maestro test flows/01_worker_login.yaml --env WORKER_EMAIL=maestro-worker@eclean.test --env BUYER_EMAIL=maestro-buyer@eclean.test --env PASSWORD=Test@1234

# All flows in order
maestro test flows/ --env WORKER_EMAIL=maestro-worker@eclean.test --env BUYER_EMAIL=maestro-buyer@eclean.test --env PASSWORD=Test@1234

# Smoke tests only (fastest — just checks app doesn't crash)
maestro test flows/09_smoke_all_tabs.yaml flows/10_smoke_buyer_tabs.yaml \
  --env WORKER_EMAIL=maestro-worker@eclean.test \
  --env BUYER_EMAIL=maestro-buyer@eclean.test \
  --env PASSWORD=Test@1234
```

## Flow descriptions

| Flow | What it tests |
|------|--------------|
| 01_worker_login | App launches → login → Worker Home |
| 02_worker_register | Register new worker → Worker Home |
| 03_buyer_login_post_task | Buyer login → 4-step post task wizard → task created |
| 04_worker_find_accept_task | Find Work map → tap task → accept |
| 05_worker_active_task_flow | Start task → upload 3 photos → submit |
| 06_buyer_review_approve | Review submitted task → AI score → approve → rate |
| 07_chat_realtime | Open chat → send message → verify |
| 08_notifications | Notifications screen loads |
| 09_smoke_all_tabs | All 5 worker tabs load without crash |
| 10_smoke_buyer_tabs | All 5 buyer tabs load without crash |

## Running on Expo Go

1. Start your app: `cd mobile && npx expo start`
2. Connect phone via USB or same WiFi
3. Open Expo Go on phone, scan QR code
4. Run: `maestro test flows/09_smoke_all_tabs.yaml ...`

## Running on real APK (Play Store build)

1. `eas build --platform android --profile preview`
2. Install APK on phone
3. Run maestro with `appId: com.eclean.app`

## Screenshots

Maestro saves screenshots automatically after each flow in `~/.maestro/tests/`
