-- AlterTable
ALTER TABLE "Order" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- Backfill from createdAt for existing orders, since no precise historical
-- record of the actual transition moment exists. Orders currently at
-- received or later (including refunded) get receivedAt backfilled — a
-- refunded order was received before it was refunded. Orders currently
-- refunded also get refundedAt backfilled.
--
-- Known gap: an order that reached `received` or `processing` and was then
-- cancelled (not refunded — see Order Cancellation) ends up at `cancelled`
-- status, not `refunded`, even though money may have changed hands. There
-- is no reliable way to distinguish that case from an order cancelled
-- while still pending_payment using only current status, so such orders'
-- receivedAt is left null. New orders are unaffected — receivedAt is set
-- at the real transition going forward and is never cleared by a later
-- cancellation.
UPDATE "Order"
SET "receivedAt" = "createdAt"
WHERE status IN ('received', 'processing', 'ready', 'shipped', 'delivered', 'refunded')
  AND "receivedAt" IS NULL;

UPDATE "Order"
SET "refundedAt" = "createdAt"
WHERE status = 'refunded'
  AND "refundedAt" IS NULL;
