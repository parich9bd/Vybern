CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "storageKey" VARCHAR(180) NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "contentType" VARCHAR(32) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "altTextEn" VARCHAR(255),
  "altTextFa" VARCHAR(255),
  "altTextDe" VARCHAR(255),
  "createdByUserId" VARCHAR(32) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE UNIQUE INDEX "MediaAsset_sha256_key" ON "MediaAsset"("sha256");
CREATE INDEX "MediaAsset_deletedAt_createdAt_idx" ON "MediaAsset"("deletedAt", "createdAt");
CREATE INDEX "MediaAsset_createdByUserId_createdAt_idx" ON "MediaAsset"("createdByUserId", "createdAt");

ALTER TABLE "ProductImage" ADD COLUMN "mediaAssetId" TEXT;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProductImage_productId_mediaAssetId_key" ON "ProductImage"("productId", "mediaAssetId");
CREATE INDEX "ProductImage_mediaAssetId_idx" ON "ProductImage"("mediaAssetId");
