CREATE TYPE "InventoryMovementType" AS ENUM ('ADJUSTMENT', 'RECEIPT', 'DAMAGE', 'RETURN');

ALTER TABLE "Product" ADD COLUMN "specifications" JSONB;

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "stockBefore" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventoryMovement_variantId_createdAt_idx" ON "InventoryMovement"("variantId", "createdAt");
CREATE INDEX "InventoryMovement_actorUserId_createdAt_idx" ON "InventoryMovement"("actorUserId", "createdAt");
