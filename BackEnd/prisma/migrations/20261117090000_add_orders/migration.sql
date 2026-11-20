CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'FULFILLED');

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "subtotalMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "reservationExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" VARCHAR(32),
  "variantId" VARCHAR(32),
  "productSlug" VARCHAR(160) NOT NULL,
  "productSku" VARCHAR(64) NOT NULL,
  "productName" VARCHAR(180) NOT NULL,
  "variantSku" VARCHAR(64) NOT NULL,
  "variantName" VARCHAR(120) NOT NULL,
  "variantColour" VARCHAR(80),
  "unitPriceMinor" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "OrderShippingAddress" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "phone" VARCHAR(16) NOT NULL,
  "addressLine1" VARCHAR(200) NOT NULL,
  "addressLine2" VARCHAR(200),
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100),
  "postalCode" VARCHAR(32) NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderShippingAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderShippingAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX "Order_status_reservationExpiresAt_idx" ON "Order"("status", "reservationExpiresAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE UNIQUE INDEX "OrderShippingAddress_orderId_key" ON "OrderShippingAddress"("orderId");
