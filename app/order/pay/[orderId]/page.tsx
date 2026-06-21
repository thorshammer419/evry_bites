import { notFound } from "next/navigation";
import { db } from "../../../../lib/db";
import { PayOrderClient } from "./PayOrderClient";

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function PayOrderPage({ params }: Props) {
  const { orderId } = await params;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { orderItems: { include: { product: true } } },
  });

  if (!order || order.status !== "pending_payment" || order.paymentMethod !== "paypal") {
    notFound();
  }

  return (
    <PayOrderClient
      orderId={order.id}
      firstName={order.firstName}
      lastName={order.lastName}
      totalAmount={Number(order.totalAmount)}
      orderItems={order.orderItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
        productName: item.product.name,
        unitLabel: item.product.unitLabel,
      }))}
    />
  );
}
