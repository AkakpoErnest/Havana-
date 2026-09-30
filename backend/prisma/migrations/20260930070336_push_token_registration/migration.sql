-- Unique id per push registration (SEC-002). Existing rows get a fresh id before the column becomes required,
-- so this is safe on a non-empty table.
ALTER TABLE "PushToken" ADD COLUMN "registration" TEXT;
UPDATE "PushToken" SET "registration" = gen_random_uuid()::text WHERE "registration" IS NULL;
ALTER TABLE "PushToken" ALTER COLUMN "registration" SET NOT NULL;
