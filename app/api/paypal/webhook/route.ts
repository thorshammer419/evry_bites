import { db } from "../../../../lib/db";
import { AcsNotifier } from "../../../../lib/acs-notifier";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body as { event_type?: string; resource?: { id?: string } };

  if (event.event_type === "INVOICING.INVOICE.PAID") {
    const invoiceId = event.resource?.id;
    if (!invoiceId) {
      return Response.json({ ok: true });
    }

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

      const notifier = new AcsNotifier();
      notifier
        .notify({ type: "order.received", order: updated })
        .catch((err) => console.error("[paypal-webhook] notification failed:", err));
    }
  }

  return Response.json({ ok: true });
}
