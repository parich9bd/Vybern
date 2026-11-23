CREATE TYPE "ServiceRequestType" AS ENUM ('EYE_EXAM', 'LENS_UPGRADE');
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'REVIEWING', 'CONTACTED', 'CLOSED');

CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL,
  "reference" VARCHAR(24) NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "type" "ServiceRequestType" NOT NULL,
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "userId" TEXT,
  "fullName" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(16) NOT NULL,
  "email" VARCHAR(254),
  "examinationType" VARCHAR(64),
  "preferredDate" TIMESTAMP(3),
  "preferredTime" VARCHAR(16),
  "frameBrand" VARCHAR(120),
  "frameModel" VARCHAR(120),
  "lensType" VARCHAR(64),
  "prescriptionAvailability" VARCHAR(64),
  "consultationDate" TIMESTAMP(3),
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRequest_reference_key" ON "ServiceRequest"("reference");
CREATE UNIQUE INDEX "ServiceRequest_idempotencyKey_key" ON "ServiceRequest"("idempotencyKey");
CREATE INDEX "ServiceRequest_type_status_createdAt_idx" ON "ServiceRequest"("type", "status", "createdAt");
CREATE INDEX "ServiceRequest_phone_createdAt_idx" ON "ServiceRequest"("phone", "createdAt");
CREATE INDEX "ServiceRequest_userId_createdAt_idx" ON "ServiceRequest"("userId", "createdAt");
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
