CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'ZARINPAL');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "providerReference" VARCHAR(160) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
CREATE UNIQUE INDEX "PaymentAttempt_providerReference_key" ON "PaymentAttempt"("providerReference");
CREATE INDEX "PaymentAttempt_paymentId_createdAt_idx" ON "PaymentAttempt"("paymentId", "createdAt");
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");
