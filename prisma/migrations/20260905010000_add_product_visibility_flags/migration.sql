-- AlterTable
ALTER TABLE "Product" ADD COLUMN "posVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "storefrontVisible" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the old single `active` flag already gated both channels
-- identically, so mirror it onto both new independent flags exactly —
-- nothing about any existing product's visibility changes today.
UPDATE "Product" SET "posVisible" = "active", "storefrontVisible" = "active";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "active";
