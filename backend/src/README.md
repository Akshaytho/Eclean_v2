# backend/src/ — Layer Architecture

```
src/
├── modules/          ← LAYER 1: Core mobile app API (auth, tasks, media, zones, etc.)
│   └── README.md         DO NOT move to separate repo. This IS the product.
│
├── intelligence/     ← LAYERS 2+3: Data analytics + B2B export
│   ├── analytics/        Zone trends, heatmaps, leaderboards, fraud detection
│   ├── data-export/      B2B API for municipalities, real estate, insurance
│   └── README.md         CAN be extracted to separate repo later.
│
├── lib/              ← SHARED: Prisma, Redis, JWT, email, logger, EventLog
│   └── event-log.ts      The bridge between core and intelligence layers
│
├── middleware/        ← SHARED: authenticate, authorize, validate, api-key-auth
│
├── jobs/             ← BACKGROUND: BullMQ workers
│   ├── ai-verify.job.ts          Core: AI photo verification
│   ├── payout.job.ts             Core: Razorpay payment processing
│   ├── cleanup.job.ts            Core: GPS log retention (90 days)
│   └── analytics-aggregate.job.ts Intelligence: daily 2AM aggregation
│
├── realtime/         ← CORE: Socket.io (GPS relay, chat, task updates)
├── config/           ← SHARED: env.ts (Zod-validated environment variables)
└── main.ts           ← Boot: starts Fastify, BullMQ workers, Socket.io
```

## The separation boundary

Everything in `intelligence/` + `jobs/analytics-aggregate.job.ts` + `middleware/api-key-auth.ts`
can move to a separate repository when the admin dashboard gets its own backend.

The `lib/event-log.ts` file stays in both repos — in the core repo it WRITES events,
in the intelligence repo it READS them (via the same EventLog table, or via a message queue).

## Data flow

```
Mobile app → Core API (modules/) → Postgres core tables
                                  → EventLog (bridge)
                                       ↓
                        Aggregation job (2 AM daily)
                                       ↓
                        Analytics tables (analytics_*)
                                       ↓
              Intelligence API (intelligence/) → Admin dashboard (Retool)
                                               → B2B customers (API key)
```
