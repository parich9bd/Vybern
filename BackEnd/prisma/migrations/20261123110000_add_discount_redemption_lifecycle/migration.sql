CREATE TYPE "DiscountRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');
ALTER TABLE "DiscountRedemption" ADD COLUMN "status" "DiscountRedemptionStatus" NOT NULL DEFAULT 'RESERVED', ADD COLUMN "releasedAt" TIMESTAMP(3), ADD COLUMN "consumedAt" TIMESTAMP(3);
CREATE INDEX "DiscountRedemption_status_idx" ON "DiscountRedemption"("status");
