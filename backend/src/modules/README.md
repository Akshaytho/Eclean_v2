# Core Modules — Mobile App API (Layer 1)

These modules power the eClean mobile app. They handle authentication,
task lifecycle, media uploads, payments, real-time communication, and
role-specific features for all 5 roles (Worker, Buyer, Supervisor, Admin, Citizen).

## What's here

| Module | Routes prefix | Purpose |
|--------|--------------|---------|
| `auth/` | `/api/v1/auth` | Login, register, refresh, forgot-password, verify-email, `/me` |
| `tasks/` | `/api/v1/buyer/tasks`, `/api/v1/worker` | Task CRUD, accept, start, submit, approve, reject, dispute |
| `media/` | `/api/v1/tasks/:id/media` | Photo upload (Cloudinary) + EXIF extraction |
| `zones/` | `/api/v1/zones` | Zone listing, supervisor inspection |
| `citizen/` | `/api/v1/citizen` | Citizen reports (create, list) |
| `supervisor/` | `/api/v1/supervisor` | Supervisor dashboard, task flagging |
| `admin/` | `/api/v1/admin` | User management, disputes, payouts, API key management |
| `notifications/` | `/api/v1/notifications` | Push notifications, device tokens, mark-read |
| `payouts/` | `/api/v1/worker/wallet`, `/api/v1/webhooks/razorpay` | Wallet, payout list, Razorpay webhook |
| `ai/` | (internal) | Claude Vision AI verification service |
| `ci/` | `/api/v1/ci/seed` | CI-only test account seeding |

## Rules

1. **These modules stay in this repo forever.** They are the production API for the mobile app.
2. **The `intelligence/` folder NEVER imports from here.** Data flows one way: core writes to EventLog, intelligence reads from it.
3. **Every mutation should call `logEvent()` or a convenience helper** from `lib/event-log.ts` after the main operation succeeds.
4. **Do not add analytics queries here.** Analytics logic belongs in `../intelligence/`.
