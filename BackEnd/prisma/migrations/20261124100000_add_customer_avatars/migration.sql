ALTER TABLE "User"
  ADD COLUMN "avatarKey" VARCHAR(128),
  ADD COLUMN "avatarContentType" VARCHAR(32),
  ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);
