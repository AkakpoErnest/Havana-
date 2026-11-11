-- Multi-country: people and listings belong to a country (GH, NG, KE); listings carry their currency.
-- Everything that exists today is in Ghana, so the defaults backfill it correctly.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'GH';

-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'GH';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'GH',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'GHS';

-- CreateIndex
CREATE INDEX "Item_country_status_idx" ON "Item"("country", "status");
