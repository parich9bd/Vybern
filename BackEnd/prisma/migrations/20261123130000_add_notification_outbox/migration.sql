CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "eventType" VARCHAR(80) NOT NULL,
  "aggregateId" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" VARCHAR(1000),
  "processingAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationOutbox_eventType_aggregateId_key" ON "NotificationOutbox"("eventType", "aggregateId");
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx" ON "NotificationOutbox"("status", "nextAttemptAt");
CREATE INDEX "NotificationOutbox_leaseExpiresAt_idx" ON "NotificationOutbox"("leaseExpiresAt");
