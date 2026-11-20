CREATE TYPE "FulfillmentStatus" AS ENUM ('UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED');

ALTER TABLE "Order"
  ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
  ADD COLUMN "trackingNumber" VARCHAR(100),
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "deliveredAt" TIMESTAMP(3);

CREATE TABLE "OrderNote" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "authorUserId" VARCHAR(32) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Order_fulfillmentStatus_createdAt_idx" ON "Order"("fulfillmentStatus", "createdAt");
CREATE INDEX "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");
CREATE INDEX "OrderNote_authorUserId_createdAt_idx" ON "OrderNote"("authorUserId", "createdAt");
