-- CreateEnum
CREATE TYPE "PaymentLinkChannel" AS ENUM ('paypal', 'venmo');

-- Track which channel a custom payment request was sent through; existing
-- rows predate Venmo tracking and were always PayPal.
ALTER TABLE "CustomPaymentRequest" ADD COLUMN "channel" "PaymentLinkChannel" NOT NULL DEFAULT 'paypal';
