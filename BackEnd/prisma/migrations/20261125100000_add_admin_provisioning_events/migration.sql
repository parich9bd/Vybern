CREATE TABLE "AdminProvisioningEvent" (
  "id" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "operatorLabel" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminProvisioningEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminProvisioningEvent_targetUserId_operation_key" ON "AdminProvisioningEvent"("targetUserId", "operation");
CREATE INDEX "AdminProvisioningEvent_createdAt_idx" ON "AdminProvisioningEvent"("createdAt");
ALTER TABLE "AdminProvisioningEvent" ADD CONSTRAINT "AdminProvisioningEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
