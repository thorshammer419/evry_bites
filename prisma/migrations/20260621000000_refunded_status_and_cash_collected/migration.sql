-- Add refunded order status
ALTER TYPE "OrderStatus" ADD VALUE 'refunded';

-- Track cash collected on cash orders
ALTER TABLE "Order" ADD COLUMN "cashCollected" DECIMAL(10, 2);
