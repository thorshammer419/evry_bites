import type { FulfillmentType, OrderStatus } from "@prisma/client";

interface OrderForNotification {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  totalAmount: unknown;
}

interface OrderItemForNotification {
  quantity: number;
  unitPrice: unknown;
  product: { name: string; unitLabel: string };
}

interface OrderReceivedForNotification extends OrderForNotification {
  paymentMethod: string;
  orderItems: OrderItemForNotification[];
}

function getStatusMessage(
  order: OrderForNotification,
  newStatus: OrderStatus
): { subject: string; body: string; sms: string } {
  const ref = order.id.slice(0, 8).toUpperCase();
  const total = `$${Number(order.totalAmount).toFixed(2)}`;

  switch (newStatus) {
    case "confirmed":
      return {
        subject: `EvryBites Order #${ref} — Confirmed!`,
        body: `Hi ${order.customerName},\n\nYour EvryBites order (#${ref}) is confirmed and being prepared! We'll reach out again when it's ready.\n\nTotal: ${total}\n\nThanks for ordering!`,
        sms: `EvryBites: Your order #${ref} is confirmed and being prepared! Total: ${total}`,
      };
    case "ready":
      return order.fulfillmentType === "local_delivery"
        ? {
            subject: `EvryBites Order #${ref} — Ready for Delivery!`,
            body: `Hi ${order.customerName},\n\nGreat news! Your order (#${ref}) is ready and on its way to you.\n\nTotal: ${total}`,
            sms: `EvryBites: Your order #${ref} is ready and out for delivery! Total: ${total}`,
          }
        : {
            subject: `EvryBites Order #${ref} — Ready to Ship!`,
            body: `Hi ${order.customerName},\n\nYour order (#${ref}) is packed and ready to ship! You'll receive tracking info shortly.\n\nTotal: ${total}`,
            sms: `EvryBites: Your order #${ref} is packed and ready to ship! Total: ${total}`,
          };
    case "delivered":
      return {
        subject: `EvryBites Order #${ref} — Delivered!`,
        body: `Hi ${order.customerName},\n\nYour order (#${ref}) has been delivered. We hope you enjoy every bite!\n\nTotal: ${total}`,
        sms: `EvryBites: Your order #${ref} has been delivered. Enjoy!`,
      };
    case "shipped":
      return {
        subject: `EvryBites Order #${ref} — Shipped!`,
        body: `Hi ${order.customerName},\n\nYour order (#${ref}) is on its way! Check your email for tracking information.\n\nTotal: ${total}`,
        sms: `EvryBites: Your order #${ref} has shipped! Check email for tracking.`,
      };
    default:
      throw new Error(`No notification template for status: ${newStatus}`);
  }
}

export async function sendOrderReceivedNotifications(
  order: OrderReceivedForNotification
): Promise<void> {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const fromEmail = process.env.ACS_FROM_EMAIL;
  const fromPhone = process.env.ACS_FROM_PHONE;
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;

  const ref = order.id.slice(0, 8).toUpperCase();
  const total = `$${Number(order.totalAmount).toFixed(2)}`;
  const itemsList = order.orderItems
    .map(
      (i) =>
        `  • ${i.quantity}x ${i.product.name} (${i.product.unitLabel}) — $${Number(i.unitPrice).toFixed(2)}/ea`
    )
    .join("\n");

  const customerSubject = `EvryBites — Order #${ref} Received!`;
  const customerBody = `Hi ${order.customerName},\n\nThank you for your order! We've received it and will confirm soon.\n\nOrder #${ref}\n\n${itemsList}\n\nTotal: ${total}\n\nWe'll reach out to confirm your order shortly. Thank you for supporting EvryBites!`;
  const customerSms = `EvryBites: Order #${ref} received! Total: ${total}. We'll confirm shortly.`;

  const ownerSubject = `New EvryBites Order #${ref} from ${order.customerName}`;
  const ownerBody = `New order received!\n\nOrder #${ref}\nCustomer: ${order.customerName}\nEmail: ${order.customerEmail}\nPhone: ${order.customerPhone}\nFulfillment: ${order.fulfillmentType}\nPayment: ${order.paymentMethod}\n\nItems:\n${itemsList}\n\nTotal: ${total}`;

  if (!connectionString) {
    console.log(
      `[notifications] ACS not configured — would send order-received notifications for #${ref}`
    );
    return;
  }

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
      ? new SmsClient(connectionString).send({
          from: fromPhone,
          to: [order.customerPhone],
          message: customerSms,
        })
      : Promise.resolve(),

    fromEmail && ownerEmail
      ? new EmailClient(connectionString).beginSend({
          senderAddress: fromEmail,
          recipients: { to: [{ address: ownerEmail }] },
          content: { subject: ownerSubject, plainText: ownerBody },
        })
      : Promise.resolve(),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[notifications] order-received notification ${i} failed:`, r.reason);
    }
  });
}

export async function sendStatusNotification(
  order: OrderForNotification,
  newStatus: OrderStatus
): Promise<void> {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const fromEmail = process.env.ACS_FROM_EMAIL;
  const fromPhone = process.env.ACS_FROM_PHONE;

  const { subject, body, sms } = getStatusMessage(order, newStatus);

  if (!connectionString) {
    console.log(
      `[notifications] ACS not configured — would send to ${order.customerEmail} / ${order.customerPhone}:`,
      { subject, sms }
    );
    return;
  }

  const { EmailClient } = await import("@azure/communication-email");
  const { SmsClient } = await import("@azure/communication-sms");

  await Promise.all([
    fromEmail
      ? new EmailClient(connectionString).beginSend({
          senderAddress: fromEmail,
          recipients: { to: [{ address: order.customerEmail }] },
          content: { subject, plainText: body },
        })
      : Promise.resolve(),

    fromPhone && order.customerPhone
      ? new SmsClient(connectionString).send({
          from: fromPhone,
          to: [order.customerPhone],
          message: sms,
        })
      : Promise.resolve(),
  ]);
}
