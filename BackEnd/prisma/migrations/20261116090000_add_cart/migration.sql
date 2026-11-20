CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" CHAR(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
CREATE INDEX "Cart_updatedAt_idx" ON "Cart"("updatedAt");
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");
