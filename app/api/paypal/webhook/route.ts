import { db } from "../../../../lib/db";
import { AcsNotifier } from "../../../../lib/acs-notifier";

const notifier = new AcsNotifier();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body as {
    event_type?: string;
    resource?: {
      id?: string;
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const captureId = event.resource?.id;
    const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;

    if (!captureId && !paypalOrderId) {
      return Response.json({ ok: true });
    }

    const order = await db.order.findFirst({
      where: paypalOrderId ? { paypalOrderId } : { paypalCaptureId: captureId },
      include: { orderItems: { include: { product: true } } },
    });

    if (order && order.status === "pending_payment") {
      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          status: "received",
          ...(captureId ? { paypalCaptureId: captureId } : {}),
        },
        include: { orderItems: { include: { product: true } } },
      });

      notifier
        .notify({ type: "order.received", order: updated })
        .catch((err) => console.error("[paypal-webhook] capture notification failed:", err));
    }
  }

  // Legacy: kept for any outstanding invoices already sent
  if (event.event_type === "INVOICING.INVOICE.PAID") {
    const invoiceId = event.resource?.id;
    if (invoiceId) {
      const order = await db.order.findFirst({
        where: { paypalInvoiceId: invoiceId },
        include: { orderItems: { include: { product: true } } },
      });

      if (order && order.status === "pending_payment") {
        const updated = await db.order.update({
          where: { id: order.id },
          data: { status: "received" },
          include: { orderItems: { include: { product: true } } },
        });

        notifier
          .notify({ type: "order.received", order: updated })
          .catch((err) => console.error("[paypal-webhook] invoice notification failed:", err));
      }
    }
  }

  return Response.json({ ok: true });
}
