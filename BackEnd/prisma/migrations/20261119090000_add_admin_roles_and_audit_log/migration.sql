ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPPORT';

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" VARCHAR(120) NOT NULL,
  "targetType" VARCHAR(80) NOT NULL,
  "targetId" VARCHAR(64),
  "metadata" JSONB,
  "ipAddress" VARCHAR(45),
  "userAgent" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
