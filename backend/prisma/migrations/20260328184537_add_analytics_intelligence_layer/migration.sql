-- Analytics Intelligence Layer Migration
-- Creates 9 new tables for the data intelligence engine.
-- All tables prefixed with analytics_ for easy identification and future separation.

-- 1. EventLog — universal mutation stream (bridge for admin separation)
CREATE TABLE "analytics_event_log" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_event_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_event_log_entity_entityId_idx" ON "analytics_event_log"("entity", "entityId");
CREATE INDEX "analytics_event_log_createdAt_idx" ON "analytics_event_log"("createdAt");
CREATE INDEX "analytics_event_log_actorId_idx" ON "analytics_event_log"("actorId");
CREATE INDEX "analytics_event_log_entity_action_idx" ON "analytics_event_log"("entity", "action");

-- 2. AnalyticsZoneSnapshot — daily per-zone intelligence
CREATE TABLE "analytics_zone_snapshot" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "city" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "dirtyScore" INTEGER NOT NULL DEFAULT 0,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksCancelled" INTEGER NOT NULL DEFAULT 0,
    "avgAiScore" DOUBLE PRECISION,
    "aiRejectionRate" DOUBLE PRECISION,
    "citizenReportCount" INTEGER NOT NULL DEFAULT 0,
    "avgCompletionTimeSecs" INTEGER,
    "activeWorkerCount" INTEGER NOT NULL DEFAULT 0,
    "openTaskCountSnapshot" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_zone_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_zone_snapshot_zoneId_date_key" ON "analytics_zone_snapshot"("zoneId", "date");
CREATE INDEX "analytics_zone_snapshot_date_idx" ON "analytics_zone_snapshot"("date");
CREATE INDEX "analytics_zone_snapshot_zoneId_date_idx" ON "analytics_zone_snapshot"("zoneId", "date");
CREATE INDEX "analytics_zone_snapshot_dirtyScore_idx" ON "analytics_zone_snapshot"("dirtyScore");

-- 3. AnalyticsPlatformMetrics — daily platform-wide rollup
CREATE TABLE "analytics_platform_metrics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksCancelled" INTEGER NOT NULL DEFAULT 0,
    "tasksDisputed" INTEGER NOT NULL DEFAULT 0,
    "totalRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "totalPayoutCents" INTEGER NOT NULL DEFAULT 0,
    "activeWorkers" INTEGER NOT NULL DEFAULT 0,
    "activeBuyers" INTEGER NOT NULL DEFAULT 0,
    "newSignups" INTEGER NOT NULL DEFAULT 0,
    "newSignupsByRole" JSONB,
    "avgTaskCompletionSecs" INTEGER,
    "avgAiScore" DOUBLE PRECISION,
    "citizenReportsTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_platform_metrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_platform_metrics_date_key" ON "analytics_platform_metrics"("date");
CREATE INDEX "analytics_platform_metrics_date_idx" ON "analytics_platform_metrics"("date");

-- 4. AnalyticsWastePattern — per-zone per-hour waste pattern
CREATE TABLE "analytics_waste_pattern" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hourOfDay" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_waste_pattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_waste_pattern_zoneId_date_hourOfDay_key" ON "analytics_waste_pattern"("zoneId", "date", "hourOfDay");
CREATE INDEX "analytics_waste_pattern_zoneId_hourOfDay_idx" ON "analytics_waste_pattern"("zoneId", "hourOfDay");
CREATE INDEX "analytics_waste_pattern_zoneId_dayOfWeek_idx" ON "analytics_waste_pattern"("zoneId", "dayOfWeek");

-- 5. AnalyticsWorkerDaily — per-worker per-day aggregation
CREATE TABLE "analytics_worker_daily" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tasksAccepted" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksCancelled" INTEGER NOT NULL DEFAULT 0,
    "avgTimeSecs" INTEGER,
    "avgAiScore" DOUBLE PRECISION,
    "totalDistanceMeters" DOUBLE PRECISION,
    "earningsCents" INTEGER NOT NULL DEFAULT 0,
    "zonesWorked" TEXT[],
    "categoriesWorked" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_worker_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_worker_daily_workerId_date_key" ON "analytics_worker_daily"("workerId", "date");
CREATE INDEX "analytics_worker_daily_date_idx" ON "analytics_worker_daily"("date");
CREATE INDEX "analytics_worker_daily_workerId_date_idx" ON "analytics_worker_daily"("workerId", "date");

-- 6. AnalyticsPhotoMeta — EXIF metadata for fraud detection
CREATE TABLE "analytics_photo_meta" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "uploaderRole" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "exifLat" DOUBLE PRECISION,
    "exifLng" DOUBLE PRECISION,
    "exifTimestamp" TIMESTAMP(3),
    "exifAltitude" DOUBLE PRECISION,
    "deviceMake" TEXT,
    "deviceModel" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "taskLat" DOUBLE PRECISION,
    "taskLng" DOUBLE PRECISION,
    "distanceFromTaskMeters" DOUBLE PRECISION,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_photo_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_photo_meta_mediaId_key" ON "analytics_photo_meta"("mediaId");
CREATE INDEX "analytics_photo_meta_taskId_idx" ON "analytics_photo_meta"("taskId");
CREATE INDEX "analytics_photo_meta_isFlagged_idx" ON "analytics_photo_meta"("isFlagged");
CREATE INDEX "analytics_photo_meta_uploaderId_idx" ON "analytics_photo_meta"("uploaderId");

-- 7. AnalyticsBehaviorEvent — user behavior stream
CREATE TABLE "analytics_behavior_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payload" JSONB,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_behavior_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_behavior_event_userId_idx" ON "analytics_behavior_event"("userId");
CREATE INDEX "analytics_behavior_event_eventType_idx" ON "analytics_behavior_event"("eventType");
CREATE INDEX "analytics_behavior_event_createdAt_idx" ON "analytics_behavior_event"("createdAt");
CREATE INDEX "analytics_behavior_event_sessionId_idx" ON "analytics_behavior_event"("sessionId");
CREATE INDEX "analytics_behavior_event_eventType_createdAt_idx" ON "analytics_behavior_event"("eventType", "createdAt");

-- 8. DataExportLog — audit trail for B2B exports (DPDP Act compliance)
CREATE TABLE "analytics_data_export_log" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "params" JSONB,
    "rowCount" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_data_export_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_data_export_log_apiKeyId_idx" ON "analytics_data_export_log"("apiKeyId");
CREATE INDEX "analytics_data_export_log_createdAt_idx" ON "analytics_data_export_log"("createdAt");

-- 9. ApiKey — B2B API key management
CREATE TABLE "analytics_api_key" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "permissions" TEXT[],
    "rateLimitTier" TEXT NOT NULL DEFAULT 'standard',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_api_key_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_api_key_keyHash_key" ON "analytics_api_key"("keyHash");
CREATE INDEX "analytics_api_key_isActive_idx" ON "analytics_api_key"("isActive");
