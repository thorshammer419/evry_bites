-- CreateTable
CREATE TABLE "ProductCostRecord" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costPerBatch" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCostRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductCostRecord" ADD CONSTRAINT "ProductCostRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: carry each product's existing supplyCostPerBatch forward into its
-- first Cost Record, effective from the product's own creation date, before
-- the old single-cost field is dropped below. Products with no cost set get
-- no record — an empty cost history, not a fabricated $0 one.
INSERT INTO "ProductCostRecord" ("id", "productId", "costPerBatch", "effectiveFrom")
SELECT gen_random_uuid()::text, "id", "supplyCostPerBatch", "createdAt"
FROM "Product"
WHERE "supplyCostPerBatch" IS NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "supplyCostPerBatch";
