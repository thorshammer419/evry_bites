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
  newStatus: OrderStatus,
  reason?: string
): { subject: string; body: string; sms: string } {
  const ref = order.id.slice(0, 8).toUpperCase();
  const total = `$${Number(order.totalAmount).toFixed(2)}`;
  const name = customerName(order);

  switch (newStatus) {
    case "received":
      return {
        subject: `EvryBites Order #${ref} — Received!`,
        body: `Hi ${name},\n\nYour EvryBites order (#${ref}) has been received and is being confirmed. We'll be in touch shortly!\n\nTotal: ${total}\n\nThanks for ordering!`,
        sms: `EvryBites: Your order #${ref} has been received! Total: ${total}. We'll confirm shortly.`,
      };
    case "processing":
      return {
        subject: `EvryBites Order #${ref} — Being Prepared!`,
        body: `Hi ${name},\n\nGreat news! Your EvryBites order (#${ref}) is now being prepared. We'll reach out again when it's ready.\n\nTotal: ${total}\n\nThanks for ordering!`,
        sms: `EvryBites: Your order #${ref} is being prepared! Total: ${total}`,
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
    case "cancelled": {
      const reasonLine = reason ? `\n\nReason: ${reason}` : "";
      return {
        subject: `EvryBites Order #${ref} — Cancelled`,
        body: `Hi ${name},\n\nYour EvryBites order (#${ref}) has been cancelled.${reasonLine}\n\nIf you have any questions, please reach out.\n\nTotal that will not be charged: ${total}`,
        sms: `EvryBites: Your order #${ref} has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
      };
    }
    case "refunded": {
      const reasonLine = reason ? `\n\nReason: ${reason}` : "";
      return {
        subject: `EvryBites Order #${ref} — Refunded`,
        body: `Hi ${name},\n\nYour EvryBites order (#${ref}) has been refunded.${reasonLine}\n\nYour refund should appear within 3–5 business days depending on your payment method. If you have any questions, please reach out.\n\nRefund amount: ${total}`,
        sms: `EvryBites: Your order #${ref} has been refunded. Amount: ${total}.`,
      };
    }
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
    } else if (event.type === "order.payment_received") {
      await this.sendPaymentReceived(event.order, connectionString);
    } else if (event.type === "order.cancelled") {
      await this.sendStatusChanged(
        event.order,
        "cancelled" as import("@prisma/client").OrderStatus,
        connectionString,
        event.reason
      );
    } else if (event.type === "order.venmo_payment_requested") {
      await this.sendVenmoPaymentRequest(event.order, connectionString);
    } else if (event.type === "order.paypal_payment_requested") {
      await this.sendPaypalPaymentRequest(event.order, event.paymentUrl, connectionString);
    } else if (event.type === "order.custom_payment_requested") {
      await this.sendCustomPaymentRequest(event.order, event.amount, event.paymentUrl, event.paymentType, connectionString);
    } else if (event.type === "order.custom_payment_received") {
      await this.sendCustomPaymentReceived(event.order, event.amount, connectionString);
    } else if (event.type === "order.custom_payment_unmarked") {
      await this.sendCustomPaymentUnmarked(event.order, event.amount, connectionString);
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

  private async sendPaymentReceived(
    order: import("./notifier").OrderReceivedForNotification,
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

    const customerSubject = `EvryBites — Payment Received for Order #${ref}`;
    const customerBody = [
      `Hi ${name},`,
      "",
      `Thank you for your payment! We've received your payment of ${total} for order #${ref}.`,
      "",
      `Order summary:`,
      itemsList,
      "",
      `Total paid: ${total}`,
      "",
      "Your order is confirmed and we'll be in touch soon. Thank you for supporting EvryBites!",
    ].join("\n");
    const customerSms = `EvryBites: Payment of ${total} received for order #${ref}. Thank you!`;

    const ownerSubject = `EvryBites — Payment Received for Order #${ref} from ${name}`;
    const ownerBody = `Payment received!\n\nOrder #${ref}\nCustomer: ${name}\nEmail: ${order.customerEmail}\nPhone: ${order.customerPhone}\nFulfillment: ${order.fulfillmentType}\nPayment: ${order.paymentMethod}\n\nItems:\n${itemsList}\n\nTotal: ${total}`;

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
        console.error(`[notifications] payment-received channel ${i} failed:`, r.reason);
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

  private async sendVenmoPaymentRequest(
    order: import("./notifier").OrderForNotification & { totalAmount: unknown },
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    if (!fromEmail) return;

    const ref = order.id.slice(0, 8).toUpperCase();
    const total = Number(order.totalAmount).toFixed(2);
    const name = customerName(order);
    const venmoHandle = process.env.VENMO_HANDLE ?? "@evrybites";
    const note = encodeURIComponent(`Order #${ref}`);
    const venmoLink = `https://venmo.com/${venmoHandle.replace("@", "")}?txn=pay&amount=${total}&note=${note}`;

    const subject = `EvryBites Order #${ref} — Payment Request`;
    const body = [
      `Hi ${name},`,
      "",
      `Your EvryBites order (#${ref}) is ready for payment via Venmo.`,
      "",
      `Amount due: $${total}`,
      "",
      `Pay now: ${venmoLink}`,
      "",
      "Tap the link above to open Venmo pre-filled with the payment details.",
      "",
      "Thank you for your order!",
    ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    const result = await new EmailClient(connectionString).beginSend({
      senderAddress: fromEmail,
      recipients: { to: [{ address: order.customerEmail }] },
      content: { subject, plainText: body },
    }).catch((err: unknown) => {
      console.error("[notifications] venmo-payment-request email failed:", err);
    });

    if (result && "pollUntilDone" in result) {
      result.pollUntilDone().catch((err: unknown) =>
        console.error("[notifications] venmo-payment-request poll failed:", err)
      );
    }
  }

  private async sendPaypalPaymentRequest(
    order: import("./notifier").OrderForNotification & { totalAmount: unknown },
    paymentUrl: string,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    if (!fromEmail) return;

    const ref = order.id.slice(0, 8).toUpperCase();
    const total = Number(order.totalAmount).toFixed(2);
    const name = customerName(order);

    const subject = `EvryBites Order #${ref} — Payment Request`;
    const body = [
      `Hi ${name},`,
      "",
      `Your EvryBites order (#${ref}) is ready for payment via PayPal or credit/debit card.`,
      "",
      `Amount due: $${total}`,
      "",
      `Pay now: ${paymentUrl}`,
      "",
      "Tap the link above to complete your payment securely.",
      "",
      "Thank you for your order!",
    ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    const result = await new EmailClient(connectionString).beginSend({
      senderAddress: fromEmail,
      recipients: { to: [{ address: order.customerEmail }] },
      content: { subject, plainText: body },
    }).catch((err: unknown) => {
      console.error("[notifications] paypal-payment-request email failed:", err);
    });

    if (result && "pollUntilDone" in result) {
      result.pollUntilDone().catch((err: unknown) =>
        console.error("[notifications] paypal-payment-request poll failed:", err)
      );
    }
  }

  private async sendCustomPaymentRequest(
    order: import("./notifier").OrderForNotification,
    amount: number,
    paymentUrl: string,
    paymentType: "paypal" | "venmo",
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    if (!fromEmail) return;

    const ref = order.id.slice(0, 8).toUpperCase();
    const name = customerName(order);

    const subject = `EvryBites — Payment Request for $${amount.toFixed(2)}`;

    const body = paymentType === "venmo"
      ? [
          `Hi ${name},`,
          "",
          `EvryBites has sent you a payment request of $${amount.toFixed(2)} related to order #${ref}.`,
          "",
          `Pay now via Venmo: ${paymentUrl}`,
          "",
          "Tap the link above to open Venmo pre-filled with the payment details.",
          "",
          "Thank you for your business!",
        ].join("\n")
      : [
          `Hi ${name},`,
          "",
          `EvryBites has sent you a payment request of $${amount.toFixed(2)} related to order #${ref}.`,
          "",
          `Pay now: ${paymentUrl}`,
          "",
          "Tap the link above to complete your payment securely via PayPal or credit/debit card.",
          "",
          "Thank you for your business!",
        ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    const result = await new EmailClient(connectionString).beginSend({
      senderAddress: fromEmail,
      recipients: { to: [{ address: order.customerEmail }] },
      content: { subject, plainText: body },
    }).catch((err: unknown) => {
      console.error("[notifications] custom-payment-request email failed:", err);
    });

    if (result && "pollUntilDone" in result) {
      result.pollUntilDone().catch((err: unknown) =>
        console.error("[notifications] custom-payment-request poll failed:", err)
      );
    }
  }

  private async sendCustomPaymentReceived(
    order: import("./notifier").OrderForNotification,
    amount: number,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!fromEmail) return;

    const ref = order.id.slice(0, 8).toUpperCase();
    const name = customerName(order);

    const customerSubject = `EvryBites — Payment of $${amount.toFixed(2)} Received`;
    const customerBody = [
      `Hi ${name},`,
      "",
      `Thank you! We've received your payment of $${amount.toFixed(2)} for order #${ref}.`,
      "",
      "Your payment has been recorded. We'll be in touch if anything else is needed.",
      "",
      "Thank you for supporting EvryBites!",
    ].join("\n");

    const ownerSubject = `EvryBites — Custom Payment of $${amount.toFixed(2)} Received for Order #${ref}`;
    const ownerBody = [
      `Custom payment received!`,
      "",
      `Order #${ref}`,
      `Customer: ${name} (${order.customerEmail})`,
      `Amount paid: $${amount.toFixed(2)}`,
      "",
      "Order status has NOT been automatically updated. Manually advance the status when ready.",
    ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    const results = await Promise.allSettled([
      new EmailClient(connectionString).beginSend({
        senderAddress: fromEmail,
        recipients: { to: [{ address: order.customerEmail }] },
        content: { subject: customerSubject, plainText: customerBody },
      }),
      ownerEmails.length > 0
        ? new EmailClient(connectionString).beginSend({
            senderAddress: fromEmail,
            recipients: { to: ownerEmails.map((address) => ({ address })) },
            content: { subject: ownerSubject, plainText: ownerBody },
          })
        : Promise.resolve(),
    ]);

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[notifications] custom-payment-received channel ${i} failed:`, r.reason);
      }
    });
  }

  private async sendCustomPaymentUnmarked(
    order: import("./notifier").OrderForNotification,
    amount: number,
    connectionString: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const ownerEmails = (process.env.OWNER_NOTIFICATION_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!fromEmail || ownerEmails.length === 0) return;

    const ref = order.id.slice(0, 8).toUpperCase();
    const name = customerName(order);

    const subject = `EvryBites — Payment Mark Reversed for Order #${ref}`;
    const body = [
      `A manually-marked payment was undone.`,
      "",
      `Order #${ref}`,
      `Customer: ${name} (${order.customerEmail})`,
      `Amount: $${amount.toFixed(2)}`,
      "",
      "The customer was NOT notified of this reversal.",
    ].join("\n");

    const { EmailClient } = await import("@azure/communication-email");
    await new EmailClient(connectionString)
      .beginSend({
        senderAddress: fromEmail,
        recipients: { to: ownerEmails.map((address) => ({ address })) },
        content: { subject, plainText: body },
      })
      .catch((err) => console.error("[notifications] custom-payment-unmarked failed:", err));
  }

  private async sendStatusChanged(
    order: OrderForNotification,
    newStatus: OrderStatus,
    connectionString: string,
    reason?: string
  ): Promise<void> {
    const fromEmail = process.env.ACS_FROM_EMAIL;
    const fromPhone = process.env.ACS_FROM_PHONE;

    const { subject, body, sms } = getStatusMessage(order, newStatus, reason);

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
