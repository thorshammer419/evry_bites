-- Historically, prisma/schema.prisma was changed directly against a live
-- database (most likely via `prisma db push`) without ever generating a
-- migration file for it — the same "schema was ahead of migrations" gap
-- already called out in 20260620000000_processing_and_paypal_ids for
-- OrderStatus. This migration closes the larger gap on "Order": splitting
-- customerName into firstName/lastName, splitting address into
-- addressLine1/city/state/zip, adding paypalOrderId, and dropping the
-- unused paymentStatus column — none of which any prior migration file
-- ever applied.
--
-- Written idempotently (guarded by information_schema checks) so it is
-- safe to run against BOTH a fresh database that only ever saw the
-- original migration history (still has customerName/address/
-- paymentStatus) AND a database — like production is believed to be —
-- that already has the current shape from that out-of-band change. In the
-- latter case every branch below is a no-op.
--
-- The name/address backfill is best-effort (a naive first-word/rest split
-- for name, and the whole address into addressLine1 with city/state/zip
-- left blank) since the original free-text columns can't be parsed
-- reliably — acceptable here because this path only ever executes against
-- a database that never received the out-of-band fix, which in practice
-- means no real order data depends on it.

-- firstName / lastName replace customerName
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "lastName" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'customerName'
  ) THEN
    UPDATE "Order"
    SET
      "firstName" = COALESCE("firstName", NULLIF(split_part("customerName", ' ', 1), '')),
      "lastName" = COALESCE("lastName", NULLIF(substring("customerName" from position(' ' in "customerName") + 1), ''))
    WHERE "firstName" IS NULL AND "lastName" IS NULL;

    ALTER TABLE "Order" DROP COLUMN "customerName";
  END IF;
END $$;

-- addressLine1 / city / state / zip replace the single address column
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "zip" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'address'
  ) THEN
    UPDATE "Order"
    SET "addressLine1" = COALESCE("addressLine1", "address")
    WHERE "addressLine1" IS NULL;

    ALTER TABLE "Order" DROP COLUMN "address";
  END IF;
END $$;

-- paypalOrderId is new — created alongside paypalCaptureId/paypalInvoiceId
-- conceptually, but the column itself was never migrated
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paypalOrderId" TEXT;

-- paymentStatus was superseded by Order Status + Cash Collected + Custom
-- Payment Requests and is unused
ALTER TABLE "Order" DROP COLUMN IF EXISTS "paymentStatus";
