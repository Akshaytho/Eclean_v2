/*
  Warnings:

  - Made the column `buyerTrustScore` on table `BuyerProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `falseRejectionCount` on table `BuyerProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isFlaggedForReview` on table `BuyerProfile` required. This step will fail if there are existing NULL values in that column.
  - Made the column `trustScore` on table `WorkerProfile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "BuyerProfile" ALTER COLUMN "buyerTrustScore" SET NOT NULL,
ALTER COLUMN "falseRejectionCount" SET NOT NULL,
ALTER COLUMN "isFlaggedForReview" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "buyerRating" INTEGER,
ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ALTER COLUMN "workWindowEnd" SET DEFAULT '16:30',
ALTER COLUMN "uploadWindowEnd" SET DEFAULT '17:00';

-- AlterTable
ALTER TABLE "WorkerProfile" ALTER COLUMN "trustScore" SET NOT NULL;

-- AlterTable
ALTER TABLE "analytics_photo_meta" ADD COLUMN     "photoHashMatch" BOOLEAN,
ADD COLUMN     "serverPhotoHash" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_taskId_createdAt_idx" ON "ChatMessage"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "CitizenReport_reporterId_idx" ON "CitizenReport"("reporterId");

-- CreateIndex
CREATE INDEX "CitizenReport_zoneId_createdAt_idx" ON "CitizenReport"("zoneId", "createdAt");

-- CreateIndex
CREATE INDEX "CitizenReport_status_idx" ON "CitizenReport"("status");

-- CreateIndex
CREATE INDEX "CitizenReport_taskId_idx" ON "CitizenReport"("taskId");

-- CreateIndex
CREATE INDEX "Payout_workerId_status_idx" ON "Payout"("workerId", "status");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Task_status_urgency_idx" ON "Task"("status", "urgency");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Task_buyerId_status_idx" ON "Task"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Task_workerId_status_idx" ON "Task"("workerId", "status");

-- CreateIndex
CREATE INDEX "Task_status_updatedAt_idx" ON "Task"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskLocationLog_taskId_workerId_idx" ON "TaskLocationLog"("taskId", "workerId");

-- CreateIndex
CREATE INDEX "TaskLocationLog_workerId_createdAt_idx" ON "TaskLocationLog"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskMedia_taskId_idx" ON "TaskMedia"("taskId");

-- CreateIndex
CREATE INDEX "TaskMedia_taskId_type_idx" ON "TaskMedia"("taskId", "type");
