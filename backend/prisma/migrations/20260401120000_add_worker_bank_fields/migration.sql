-- AlterTable: Add bank account fields to WorkerProfile for Razorpay payouts
ALTER TABLE "WorkerProfile" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "WorkerProfile" ADD COLUMN "ifscCode" TEXT;
ALTER TABLE "WorkerProfile" ADD COLUMN "accountHolderName" TEXT;
ALTER TABLE "WorkerProfile" ADD COLUMN "razorpayContactId" TEXT;
ALTER TABLE "WorkerProfile" ADD COLUMN "razorpayFundAccountId" TEXT;
