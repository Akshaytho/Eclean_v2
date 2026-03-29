-- Add idempotency key to TaskMedia (prevents duplicate uploads on retry)
ALTER TABLE "TaskMedia" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "TaskMedia_idempotencyKey_key" ON "TaskMedia"("idempotencyKey");

-- Add AI model version to Task (traces which model scored each task)
ALTER TABLE "Task" ADD COLUMN "aiModelVersion" TEXT;
