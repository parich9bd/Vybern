-- Initial VYBERN catalogue schema. Monetary amounts are stored in integer minor units.
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ModelFormat" AS ENUM ('GLB', 'GLTF', 'USDZ');

CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "phone" VARCHAR(16) NOT NULL UNIQUE, "firstName" VARCHAR(100), "lastName" VARCHAR(100), "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER', "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "Category" ("id" TEXT PRIMARY KEY, "slug" VARCHAR(120) NOT NULL UNIQUE, "position" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CategoryTranslation" ("id" TEXT PRIMARY KEY, "categoryId" TEXT NOT NULL REFERENCES "Category"("id") ON DELETE CASCADE, "locale" VARCHAR(5) NOT NULL, "name" VARCHAR(120) NOT NULL, UNIQUE("categoryId", "locale"));
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "slug" VARCHAR(160) NOT NULL UNIQUE, "sku" VARCHAR(64) NOT NULL UNIQUE, "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT', "categoryId" TEXT NOT NULL REFERENCES "Category"("id") ON DELETE RESTRICT, "basePriceMinor" INTEGER NOT NULL, "currency" CHAR(3) NOT NULL, "isFeatured" BOOLEAN NOT NULL DEFAULT false, "tryOnAvailable" BOOLEAN NOT NULL DEFAULT false, "tryOnModelUrl" VARCHAR(2048), "tryOnModelFormat" "ModelFormat", "frameWidthMm" INTEGER, "lensWidthMm" INTEGER, "bridgeWidthMm" INTEGER, "templeLengthMm" INTEGER, "calibration" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ProductTranslation" ("id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE, "locale" VARCHAR(5) NOT NULL, "name" VARCHAR(180) NOT NULL, "description" TEXT, "material" VARCHAR(120), UNIQUE("productId", "locale"));
CREATE TABLE "ProductImage" ("id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE, "url" VARCHAR(2048) NOT NULL, "alt" VARCHAR(255), "position" INTEGER NOT NULL DEFAULT 0, UNIQUE("productId", "position"));
CREATE TABLE "ProductVariant" ("id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE, "sku" VARCHAR(64) NOT NULL UNIQUE, "name" VARCHAR(120) NOT NULL, "colour" VARCHAR(80), "priceMinor" INTEGER, "stockOnHand" INTEGER NOT NULL DEFAULT 0 CHECK ("stockOnHand" >= 0), "stockReserved" INTEGER NOT NULL DEFAULT 0 CHECK ("stockReserved" >= 0 AND "stockReserved" <= "stockOnHand"), "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "Category_isActive_position_idx" ON "Category"("isActive", "position");
CREATE INDEX "CategoryTranslation_locale_name_idx" ON "CategoryTranslation"("locale", "name");
CREATE INDEX "Product_status_isFeatured_createdAt_idx" ON "Product"("status", "isFeatured", "createdAt");
CREATE INDEX "Product_categoryId_status_idx" ON "Product"("categoryId", "status");
CREATE INDEX "ProductTranslation_locale_name_idx" ON "ProductTranslation"("locale", "name");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");
