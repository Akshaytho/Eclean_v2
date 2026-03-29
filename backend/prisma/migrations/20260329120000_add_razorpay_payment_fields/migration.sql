-- AlterTable: add Razorpay payment fields to Task
-- razorpayOrderId: Razorpay Order ID created when buyer posts task
-- razorpayPaymentId: Razorpay Payment ID after buyer completes checkout

ALTER TABLE "Task" ADD COLUMN "razorpayOrderId" TEXT;
ALTER TABLE "Task" ADD COLUMN "razorpayPaymentId" TEXT;

-- Unique indexes (prevent double-spending)
CREATE UNIQUE INDEX "Task_razorpayOrderId_key" ON "Task"("razorpayOrderId");
CREATE UNIQUE INDEX "Task_razorpayPaymentId_key" ON "Task"("razorpayPaymentId");
