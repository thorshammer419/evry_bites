-- CreateTable
CREATE TABLE "CustomPaymentRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paypalOrderId" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomPaymentRequest" ADD CONSTRAINT "CustomPaymentRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
