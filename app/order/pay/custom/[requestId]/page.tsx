import { notFound } from "next/navigation";
import { db } from "../../../../../lib/db";
import { PayCustomClient } from "./PayCustomClient";

interface Props {
  params: Promise<{ requestId: string }>;
}

export default async function PayCustomPage({ params }: Props) {
  const { requestId } = await params;

  const request = await db.customPaymentRequest.findUnique({
    where: { id: requestId },
    include: { order: true },
  });

  if (!request || request.paid) {
    notFound();
  }

  return (
    <PayCustomClient
      requestId={request.id}
      amount={Number(request.amount)}
      orderId={request.orderId}
      firstName={request.order.firstName}
      lastName={request.order.lastName}
    />
  );
}
