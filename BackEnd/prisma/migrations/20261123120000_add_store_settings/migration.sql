CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "storeName" VARCHAR(160) NOT NULL,
    "storeDescription" VARCHAR(2000),
    "contactEmail" VARCHAR(254),
    "contactPhone" VARCHAR(16),
    "supportInfo" VARCHAR(2000),
    "supportedLanguages" TEXT[] NOT NULL DEFAULT ARRAY['en', 'fa', 'de']::TEXT[],
    "defaultLanguage" VARCHAR(8) NOT NULL DEFAULT 'fa',
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'IRR',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" VARCHAR(160),
    "seoDescription" VARCHAR(320),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreSettings_singleton" CHECK ("id" = 1)
);

INSERT INTO "StoreSettings" ("id", "storeName", "updatedAt")
VALUES (1, 'VYBERN EYEWEAR', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
