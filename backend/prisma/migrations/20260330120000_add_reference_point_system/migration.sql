-- Add new enum values to MediaType
ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'VERIFICATION';
ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'ARRIVAL';

-- Add new Task fields for reference point system
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "indoorOutdoor" TEXT DEFAULT 'OUTDOOR';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "totalReferencePoints" INTEGER DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "areaSizeEstimate" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workStartedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workDurationSecs" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "ruleEngineScore" INTEGER;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "ruleEngineBreakdown" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "adversarialScore" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "adversarialAnomalies" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "finalDecision" TEXT;

-- CreateTable: TaskReferencePoint
CREATE TABLE "TaskReferencePoint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "pointIndex" INTEGER NOT NULL,
    "label" TEXT,
    "buyerImageUrl" TEXT NOT NULL,
    "buyerImagePublicId" TEXT,
    "buyerLat" DOUBLE PRECISION,
    "buyerLng" DOUBLE PRECISION,
    "buyerHeading" DOUBLE PRECISION,
    "isVerificationPoint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskReferencePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkerPointSubmission
CREATE TABLE "WorkerPointSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "referencePointId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "workerLat" DOUBLE PRECISION,
    "workerLng" DOUBLE PRECISION,
    "workerHeading" DOUBLE PRECISION,
    "photoHash" TEXT,
    "capturedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "locationMatchScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerPointSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: TaskReferencePoint
CREATE UNIQUE INDEX "TaskReferencePoint_taskId_pointIndex_key" ON "TaskReferencePoint"("taskId", "pointIndex");
CREATE INDEX "TaskReferencePoint_taskId_idx" ON "TaskReferencePoint"("taskId");

-- CreateIndex: WorkerPointSubmission
CREATE UNIQUE INDEX "WorkerPointSubmission_idempotencyKey_key" ON "WorkerPointSubmission"("idempotencyKey");
CREATE INDEX "WorkerPointSubmission_taskId_idx" ON "WorkerPointSubmission"("taskId");
CREATE INDEX "WorkerPointSubmission_referencePointId_idx" ON "WorkerPointSubmission"("referencePointId");
CREATE INDEX "WorkerPointSubmission_workerId_idx" ON "WorkerPointSubmission"("workerId");

-- AddForeignKey: TaskReferencePoint -> Task
ALTER TABLE "TaskReferencePoint" ADD CONSTRAINT "TaskReferencePoint_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: WorkerPointSubmission -> Task
ALTER TABLE "WorkerPointSubmission" ADD CONSTRAINT "WorkerPointSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Worker trust score
ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "trustScore" INTEGER DEFAULT 70;

-- Buyer accountability fields
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "buyerTrustScore" INTEGER DEFAULT 70;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "falseRejectionCount" INTEGER DEFAULT 0;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "isFlaggedForReview" BOOLEAN DEFAULT false;

-- AddForeignKey: WorkerPointSubmission -> TaskReferencePoint
ALTER TABLE "WorkerPointSubmission" ADD CONSTRAINT "WorkerPointSubmission_referencePointId_fkey" FOREIGN KEY ("referencePointId") REFERENCES "TaskReferencePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- SILENT WITNESS PROTOCOL TABLES
-- ============================================================

-- TaskEnvironmentFingerprint (buyer's environmental DNA)
CREATE TABLE IF NOT EXISTS "TaskEnvironmentFingerprint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "magX" DOUBLE PRECISION,
    "magY" DOUBLE PRECISION,
    "magZ" DOUBLE PRECISION,
    "barometer" DOUBLE PRECISION,
    "ambientLight" DOUBLE PRECISION,
    "cellType" TEXT,
    "cellCarrier" TEXT,
    "wifiNetworks" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEnvironmentFingerprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskEnvironmentFingerprint_taskId_key" ON "TaskEnvironmentFingerprint"("taskId");
ALTER TABLE "TaskEnvironmentFingerprint" ADD CONSTRAINT "TaskEnvironmentFingerprint_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkerEnvironmentCapture (worker's environmental DNA per checkpoint)
CREATE TABLE IF NOT EXISTS "WorkerEnvironmentCapture" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "captureType" TEXT NOT NULL,
    "magX" DOUBLE PRECISION,
    "magY" DOUBLE PRECISION,
    "magZ" DOUBLE PRECISION,
    "barometer" DOUBLE PRECISION,
    "ambientLight" DOUBLE PRECISION,
    "cellType" TEXT,
    "cellCarrier" TEXT,
    "wifiNetworks" TEXT,
    "matchScore" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerEnvironmentCapture_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkerEnvironmentCapture_taskId_idx" ON "WorkerEnvironmentCapture"("taskId");
CREATE INDEX IF NOT EXISTS "WorkerEnvironmentCapture_workerId_idx" ON "WorkerEnvironmentCapture"("workerId");
ALTER TABLE "WorkerEnvironmentCapture" ADD CONSTRAINT "WorkerEnvironmentCapture_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskMotionSummary (accelerometer-based work proof)
CREATE TABLE IF NOT EXISTS "TaskMotionSummary" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "cleaningPct" DOUBLE PRECISION NOT NULL,
    "walkingPct" DOUBLE PRECISION NOT NULL,
    "standingPct" DOUBLE PRECISION NOT NULL,
    "vehiclePct" DOUBLE PRECISION NOT NULL,
    "totalWindows" INTEGER NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "hasRedFlag" BOOLEAN NOT NULL DEFAULT false,
    "hasYellowFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskMotionSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskMotionSummary_taskId_key" ON "TaskMotionSummary"("taskId");
ALTER TABLE "TaskMotionSummary" ADD CONSTRAINT "TaskMotionSummary_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CitizenVerification (crowd-sourced post-task audit)
CREATE TABLE IF NOT EXISTS "CitizenVerification" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "rating" TEXT NOT NULL,
    "citizenLat" DOUBLE PRECISION,
    "citizenLng" DOUBLE PRECISION,
    "matchesWorker" BOOLEAN,
    "rewardAmount" INTEGER NOT NULL,
    "rewardPaid" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CitizenVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CitizenVerification_taskId_idx" ON "CitizenVerification"("taskId");
CREATE INDEX IF NOT EXISTS "CitizenVerification_citizenId_idx" ON "CitizenVerification"("citizenId");
ALTER TABLE "CitizenVerification" ADD CONSTRAINT "CitizenVerification_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
