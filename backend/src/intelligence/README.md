# Intelligence Layer — Data Engine (Layers 2 + 3)

This folder contains the analytics engine and B2B data export system.
It is **deliberately isolated** from core modules and designed to be
extracted into a separate repository when the admin dashboard gets its own backend.

## What's here

| Module | Routes prefix | Auth | Purpose |
|--------|--------------|------|---------|
| `analytics/` | `/api/v1/analytics` | JWT (Admin/Supervisor) | Zone trends, heatmaps, platform metrics, worker leaderboard, photo fraud, supply-demand, behavior events |
| `data-export/` | `/api/v1/data` | API Key (`x-api-key`) | B2B data export for municipalities, real estate, insurance (anonymized, audit-logged) |

## Related files (outside this folder)

| File | Location | Purpose |
|------|----------|---------|
| Event log utility | `lib/event-log.ts` | Bridge table — core writes here, intelligence reads from here |
| API key middleware | `middleware/api-key-auth.ts` | B2B authentication for data-export endpoints |
| Aggregation job | `jobs/analytics-aggregate.job.ts` | Daily 2AM BullMQ job computing zone scores, platform metrics, waste patterns, worker stats |
| Analytics Prisma models | `prisma/schema.prisma` | All tables prefixed `analytics_` via `@@map` |

## Separation rules (DO NOT BREAK)

1. **NEVER import from `../modules/`** — no `import { taskService } from '../modules/tasks/...'`. Read raw data via own Prisma queries against core tables.
2. **NEVER write to core tables** — only read. All writes go to `analytics_*` tables.
3. **All analytics tables use `@@map('analytics_*')`** — easy to identify and migrate by prefix.
4. **EventLog is the bridge** — today it's a Postgres table. Tomorrow it becomes a Redis Stream or Kafka topic. This folder's code doesn't change.
5. **Idempotent aggregation** — daily job uses upsert with `(date + entityId)`. Safe to re-run.

## When to split

When the admin gets its own repo (Next.js backend), move this entire folder + `lib/event-log.ts` + `middleware/api-key-auth.ts` + `jobs/analytics-aggregate.job.ts` + all `analytics_*` Prisma models. The core backend keeps running unchanged.
