DROP INDEX "NotificationOutbox_eventType_aggregateId_key";
ALTER TABLE "NotificationOutbox" ADD COLUMN "deduplicationKey" VARCHAR(180);
CREATE UNIQUE INDEX "NotificationOutbox_deduplicationKey_key" ON "NotificationOutbox"("deduplicationKey");
