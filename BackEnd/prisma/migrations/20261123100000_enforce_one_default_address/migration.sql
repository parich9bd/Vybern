CREATE UNIQUE INDEX "CustomerAddress_one_default_per_user" ON "CustomerAddress" ("userId") WHERE "isDefault" = true;
