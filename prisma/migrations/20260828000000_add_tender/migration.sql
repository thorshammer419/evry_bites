-- CreateEnum
CREATE TYPE "TenderMethod" AS ENUM ('cash', 'paypal', 'venmo');

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "TenderMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
