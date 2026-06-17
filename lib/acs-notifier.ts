import type { OrderStatus } from "@prisma/client";
import type {
  Notifier,
  OrderEvent,
  OrderForNotification,
  OrderReceivedForNotification,
} from "./notifier";

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function customerName(order: OrderForNotification): string {
  const first = order.firstName ?? "";
  const last = order.lastName ?? "";
  return `${first} ${last}`.trim() || "Customer";
}

function getStatusMessage(
  order: OrderForNotification,
  newStatus: OrderStatus
): { subject: string; body: string; sms: string } {
  const ref = order.id.slice(0, 8).toUpperCase();
  const total = `$${Number(order.totalAmount).toFixed(2)}`;
  const name = customerName(order);

  switch (newStatus) {
    case "confirmed":
      return {
        subject: `EvryBites Order #${ref} — Confirmed!`,
        body: `Hi ${name},\n\nYour EvryBites order (#${ref}) is confirmed and being prepared! We'll reach out again when it's ready.\n\nTotal: ${total}\n\nThanks for ordering!`,
        sms: `EvryBites: Your order #${ref} is confirmed and being prepared! Total: ${total}`,
      };
    case "ready":
      return order.fulfillmentType === "local_delivery"
        ? {
            subject: `EvryBites Order #${ref} — Ready for Delivery!`,
            body: `Hi ${name},\n\nGreat news! Your order (#${ref}) is ready and on its way to you.\n\nTotal: ${total}`,
            sms: `EvryBites: Your order #${ref} is ready and out for delivery! Total: ${total}`,
          }
        : {
            subject: `EvryBites Order #${ref} — Ready to Ship!`,
            body: `Hi ${name},\n\nYour order (#${ref}) is packed and ready to ship! You'll receive tracking info shortly.\n\nTotal: ${total}`,
            sms: `EvryBites: Your order #${ref} is packed and ready to ship! Total: ${total}`,
          };
    case "delivered":
      return {
        subject: `EvryBites Order #${ref} — Delivered!`,
        body: `Hi ${name},\n\nYour order (#${ref}) has been delivered. We hope you enjoy every bite!\n\nTotal: ${total}`,
        sms: `EvryBites: Your order #${ref} has been delivered. Enjoy!`,
      };
    case "shipped":
      return {
        subject: `EvryBites Order #${ref} — Shipped!`,
        body: `Hi ${name},\n\nYour order (#${ref}) is on its way! Check your email for tracking information.\n\nTotal: ${total}`,
        sms: `EvryBites: Your order #${ref} has shipped! Check email for tracking.`,
      };
    default:
      throw new Error(`No notification template for status: ${newStatus}`);
  }
}

export class AcsNotifier implements Notifier {
  async notify(event: OrderEvent): Promise<void> {
    const connectionString = process.env.ACS_CONNECTION_STRING;
    if (!connectionString) {
      console.log(`[notifications] ACS not configured — skipping ${event.type}`);
      return;
    }

    if (event.type === "order.received") {
      await this.sendOrderReceived(event.order, connectionString);
    } else if (event.type === "user.cash_check_requested") {
      await this.sendCashCheckRequest(event.request, connectionString);
    } else {
      await this.sendStatusChanged(event.order, event.newStatus, connectionString);
    }
  }

  private async sendOrderReceived(
    order: OrderReceivedForNotification,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const fromPhone = process.env.ACS_FROM_PHONE;
    const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    const ref = order.id.slice(0, 8).toUpperCase();
    const total = `$${Number(order.totalAmount).toFixed(2)}`;
    const name = customerName(order);
    const itemsList = order.orderItems
      .map(
        (i) =>
          `  • ${i.quantity}x ${i.product.name} (${i.product.unitLabel}) — $${Number(i.unitPrice).toFixed(2)}/ea`
      )
      .join("\n");

    const customerSubject = `EvryBites — Order #${ref} Received!`;
    const customerBody = `Hi ${name},\n\nThank you for your order! We've received it and will confirm soon.\n\nOrder #${ref}\n\n${itemsList}\n\nTotal: ${total}\n\nWe'll reach out to confirm your order shortly. Thank you for supporting EvryBites!`;
    const customerSms = `EvryBites: Order #${ref} received! Total: ${total}. We'll confirm shortly.`;

    const ownerSubject = `New EvryBites Order #${ref} from ${name}`;
    const ownerBody = `New order received!\n\nOrder #${ref}\nCustomer: ${name}\nEmail: ${order.customerEmail}\nPhone: ${order.customerPhone}\nFulfillment: ${order.fulfillmentType}\nPayment: ${order.paymentMethod}\n\nItems:\n${itemsList}\n\nTotal: ${total}`;

    const { EmailClient } = await import("@azure/communication-email");
    const { SmsClient } = await import("@azure/communication-sms");

    const results = await Promise.allSettled([
      fromEmail
        ? new EmailClient(connectionString).beginSend({
            senderAddress: fromEmail,
            recipients: { to: [{ address: order.customerEmail }] },
            content: { subject: customerSubject, plainText: customerBody },
          })
        : Promise.resolve(),

      fromPhone && order.customerPhone
        ? (() => {
            const to = toE164(order.customerPhone);
            return to
              ? new SmsClient(connectionString).send({ from: fromPhone, to: [to], message: customerSms })
              : Promise.reject(new Error(`Cannot normalize phone to E.164: ${order.customerPhone}`));
          })()
        : Promise.resolve(),

      fromEmail && ownerEmails.length > 0
        ? new EmailClient(connectionString).beginSend({
            senderAddress: fromEmail,
            recipients: { to: ownerEmails.map((address) => ({ address })) },
            content: { subject: ownerSubject, plainText: ownerBody },
          })
        : Promise.resolve(),
    ]);

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[notifications] order-received channel ${i} failed:`, r.reason);
      }
    });
  }

  private async sendCashCheckRequest(
    request: import("./notifier").CashCheckRequestForNotification,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (!fromEmail || ownerEmails.length === 0) return;

    const subject = `EvryBites — Cash/Check Approval Request from ${request.customerName}`;
    const body = [
      `${request.customerName} (${request.customerEmail}) is requesting approval for Cash/Check payments.`,
      "",
      `Approve: ${request.approveUrl}`,
      `Deny:    ${request.denyUrl}`,
      "",
      "These links expire in 72 hours.",
    ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    const result = await new EmailClient(connectionString).beginSend({
      senderAddress: fromEmail,
      recipients: { to: ownerEmails.map((address) => ({ address })) },
      content: { subject, plainText: body },
    }).catch((err: unknown) => {
      console.error("[notifications] cash-check-request email failed:", err);
    });

    if (result && "pollUntilDone" in result) {
      result.pollUntilDone().catch((err: unknown) =>
        console.error("[notifications] cash-check-request poll failed:", err)
      );
    }
  }

  private async sendStatusChanged(
    order: OrderForNotification,
    newStatus: OrderStatus,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const fromPhone = process.env.ACS_FROM_PHONE;

    const { subject, body, sms } = getStatusMessage(order, newStatus);

    const { EmailClient } = await import("@azure/communication-email");
    const { SmsClient } = await import("@azure/communication-sms");

    const results = await Promise.allSettled([
      fromEmail
        ? new EmailClient(connectionString).beginSend({
            senderAddress: fromEmail,
            recipients: { to: [{ address: order.customerEmail }] },
            content: { subject, plainText: body },
          })
        : Promise.resolve(),

      fromPhone && order.customerPhone
        ? (() => {
            const to = toE164(order.customerPhone);
            return to
              ? new SmsClient(connectionString).send({ from: fromPhone, to: [to], message: sms })
              : Promise.reject(new Error(`Cannot normalize phone to E.164: ${order.customerPhone}`));
          })()
        : Promise.resolve(),
    ]);

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[notifications] status-changed channel ${i} failed:`, r.reason);
      }
    });
  }
}
