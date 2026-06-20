-- Add pending_payment value if it was not yet applied (schema was ahead of migrations)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pending_payment';

-- Rename confirmed → processing
ALTER TYPE "OrderStatus" RENAME VALUE 'confirmed' TO 'processing';

-- Add PayPal capture and invoice ID columns
ALTER TABLE "Order" ADD COLUMN "paypalCaptureId" TEXT;
ALTER TABLE "Order" ADD COLUMN "paypalInvoiceId" TEXT;
