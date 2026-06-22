import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { isValidTransition, REFUND_STATUSES } from "../../lib/order-lifecycle";

const INCLUDE_FULL = {
  orderItems: { include: { product: true } },
} as const;

const orderFieldsSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  fulfillmentType: z.enum(["local_delivery", "shipping"]),
  addressLine1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}$/, "ZIP must be 5 digits"),
  paymentMethod: z.enum(["venmo", "paypal", "cash", "check"]),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

async function resolveProducts(items: { productId: string; quantity: number }[]) {
  const productIds = items.map((i) => i.productId);
  const products = await db.product.findMany({ where: { id: { in: productIds } } });

  const productMap: Record<string, (typeof products)[number]> = {};
  for (const product of products) productMap[product.id] = product;

  for (const item of items) {
    const product = productMap[item.productId];
    if (!product || !product.active) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One or more items are no longer available." });
    }
    if (product.unitsAvailable !== null && product.unitsAvailable < item.quantity) {
      const available = product.unitsAvailable;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: available === 0
          ? `${product.name} is sold out.`
          : `Only ${available} unit(s) of ${product.name} available.`,
      });
    }
  }

  let totalAmount = 0;
  for (const item of items) {
    totalAmount += Number(productMap[item.productId].price) * item.quantity;
  }

  return { productMap, totalAmount };
}

async function decrementStock(items: { productId: string; quantity: number }[]) {
  for (const item of items) {
    await db.product.updateMany({
      where: { id: item.productId, unitsAvailable: { not: null } },
      data: { unitsAvailable: { decrement: item.quantity } },
    });
    // Floor at 0 to avoid negatives from concurrent orders
    await db.product.updateMany({
      where: { id: item.productId, unitsAvailable: { lt: 0 } },
      data: { unitsAvailable: 0 },
    });
  }
}

async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE ?? "sandbox";
  const baseUrl = mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[paypal] auth failed ${res.status}: ${body}`);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal auth failed (${res.status}): ${body}` });
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function sendPaypalInvoice(order: {
  id: string;
  customerEmail: string;
  firstName: string | null;
  lastName: string | null;
  totalAmount: unknown;
}): Promise<string> {
  const mode = process.env.PAYPAL_MODE ?? "sandbox";
  const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const accessToken = await getPaypalAccessToken();
  const ref = order.id.slice(0, 8).toUpperCase();
  const total = Number(order.totalAmount).toFixed(2);

  const createRes = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      detail: {
        invoice_number: ref,
        currency_code: "USD",
        note: `EvryBites order #${ref}`,
      },
      primary_recipients: [{
        billing_info: { email_address: order.customerEmail },
      }],
      items: [{
        name: `Order #${ref}`,
        quantity: "1",
        unit_amount: { currency_code: "USD", value: total },
      }],
      amount: { breakdown: { item_total: { currency_code: "USD", value: total } } },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "(unreadable)");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PayPal invoice creation failed (${createRes.status}): ${body}`,
    });
  }

  const created = await createRes.json() as { href?: string; id?: string };
  const invoiceId = created.id ?? (created.href?.split("/").pop() ?? "");

  const sendRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ send_to_recipient: true }),
  });

  if (!sendRes.ok) {
    const body = await sendRes.text().catch(() => "(unreadable)");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PayPal invoice send failed (${sendRes.status}): ${body}`,
    });
  }

  return invoiceId;
}

async function refundPaypalCapture(captureId: string): Promise<void> {
  const mode = process.env.PAYPAL_MODE ?? "sandbox";
  const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const accessToken = await getPaypalAccessToken();

  const res = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `PayPal refund failed (${res.status}): ${body}`,
    });
  }
}

export const ordersRouter = router({
  listAll: publicProcedure.query(() =>
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: INCLUDE_FULL,
    })
  ),

  updateStatus: publicProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["pending_payment", "received", "processing", "ready", "shipped", "delivered", "cancelled", "refunded"]),
      cashCollected: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const order = await db.order.findUniqueOrThrow({
        where: { id: input.id },
        include: INCLUDE_FULL,
      });

      if (!isValidTransition(order, input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from ${order.status} to ${input.status}.`,
        });
      }

      const updated = await db.order.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.cashCollected !== undefined ? { cashCollected: input.cashCollected } : {}),
        },
        include: INCLUDE_FULL,
      });

      await ctx.notifier.notify({ type: "order.status_changed", order: updated, newStatus: input.status });

      return updated;
    }),

  submit: publicProcedure
    .input(orderFieldsSchema)
    .mutation(async ({ input, ctx }) => {
      const { productMap, totalAmount } = await resolveProducts(input.items);

      const order = await db.order.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          fulfillmentType: input.fulfillmentType,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          zip: input.zip,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          totalAmount: totalAmount.toFixed(2),
          orderItems: {
            create: input.items.map((item) => {
              const unitPrice = Number(productMap[item.productId].price);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: unitPrice.toFixed(2),
                subtotal: (unitPrice * item.quantity).toFixed(2),
              };
            }),
          },
        },
        include: { orderItems: { include: { product: true } } },
      });

      await decrementStock(input.items);

      ctx.notifier
        .notify({ type: "order.received", order })
        .catch((err) => console.error("[orders] order-received notification failed:", err));

      return order;
    }),

  createPaypalOrder: publicProcedure
    .input(orderFieldsSchema)
    .mutation(async ({ input }) => {
      const { productMap, totalAmount } = await resolveProducts(input.items);
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

      const order = await db.order.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          fulfillmentType: input.fulfillmentType,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          zip: input.zip,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          status: "pending_payment",
          totalAmount: totalAmount.toFixed(2),
          orderItems: {
            create: input.items.map((item) => {
              const unitPrice = Number(productMap[item.productId].price);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: unitPrice.toFixed(2),
                subtotal: (unitPrice * item.quantity).toFixed(2),
              };
            }),
          },
        },
        include: { orderItems: { include: { product: true } } },
      });

      const accessToken = await getPaypalAccessToken();
      const paypalRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: order.id,
            amount: { currency_code: "USD", value: totalAmount.toFixed(2) },
          }],
        }),
      });

      if (!paypalRes.ok) {
        const body = await paypalRes.text().catch(() => "(unreadable)");
        console.error(`[paypal] order creation failed ${paypalRes.status}: ${body}`);
        await db.order.delete({ where: { id: order.id } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal order creation failed (${paypalRes.status}): ${body}` });
      }

      const paypalOrder = await paypalRes.json() as { id: string };
      await db.order.update({ where: { id: order.id }, data: { paypalOrderId: paypalOrder.id } });

      return { orderId: order.id, paypalOrderId: paypalOrder.id };
    }),

  capturePaypalOrder: publicProcedure
    .input(z.object({ orderId: z.string(), paypalOrderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

      const accessToken = await getPaypalAccessToken();
      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${input.paypalOrderId}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!captureRes.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment capture failed." });
      }

      const captureData = await captureRes.json() as {
        payment_source?: { venmo?: unknown; paypal?: unknown };
        purchase_units?: { payments?: { captures?: { id?: string; seller_receivable_breakdown?: { paypal_fee?: { value?: string } } }[] } }[];
      };

      const actualPaymentMethod = captureData.payment_source?.venmo ? "venmo" : "paypal";
      const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;

      const order = await db.order.update({
        where: { id: input.orderId },
        data: {
          status: "received",
          paymentMethod: actualPaymentMethod,
          ...(captureId ? { paypalCaptureId: captureId } : {}),
        },
        include: { orderItems: { include: { product: true } } },
      });

      await decrementStock(order.orderItems.map(i => ({ productId: i.productId, quantity: i.quantity })));

      ctx.notifier
        .notify({ type: "order.received", order })
        .catch((err) => console.error("[orders] order-received notification failed:", err));

      return order;
    }),

  createPaypalOrderForPayerInfo: publicProcedure
    .input(z.object({
      items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
    }))
    .mutation(async ({ input }) => {
      const { totalAmount } = await resolveProducts(input.items);
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const token = await getPaypalAccessToken();

      const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: totalAmount.toFixed(2) } }],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal order creation failed: ${text}` });
      }
      const data = await res.json() as { id: string };
      return { paypalOrderId: data.id };
    }),

  capturePaypalWithPayerInfo: publicProcedure
    .input(z.object({
      paypalOrderId: z.string(),
      fulfillmentType: z.enum(["local_delivery", "shipping"]),
      addressLine1: z.string().min(1),
      city: z.string().min(1),
      state: z.string().length(2),
      zip: z.string().regex(/^\d{5}$/),
      notes: z.string().optional(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const { productMap, totalAmount } = await resolveProducts(input.items);
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const token = await getPaypalAccessToken();

      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${input.paypalOrderId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!captureRes.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment capture failed." });
      }

      const captureData = await captureRes.json() as {
        payer?: {
          name?: { given_name?: string; surname?: string };
          email_address?: string;
          phone?: { phone_number?: { national_number?: string } };
        };
        payment_source?: { venmo?: unknown };
        purchase_units?: { payments?: { captures?: { id?: string }[] } }[];
      };

      const actualPaymentMethod = captureData.payment_source?.venmo ? "venmo" : "paypal";
      const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      const firstName = captureData.payer?.name?.given_name ?? "";
      const lastName = captureData.payer?.name?.surname ?? "";
      const customerEmail = captureData.payer?.email_address ?? "";
      const customerPhone = captureData.payer?.phone?.phone_number?.national_number ?? "";

      const order = await db.order.create({
        data: {
          firstName,
          lastName,
          customerEmail,
          customerPhone,
          fulfillmentType: input.fulfillmentType,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          zip: input.zip,
          paymentMethod: actualPaymentMethod,
          notes: input.notes,
          status: "received",
          totalAmount: totalAmount.toFixed(2),
          paypalOrderId: input.paypalOrderId,
          ...(captureId ? { paypalCaptureId: captureId } : {}),
          orderItems: {
            create: input.items.map((item) => {
              const unitPrice = Number(productMap[item.productId].price);
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: unitPrice.toFixed(2),
                subtotal: (unitPrice * item.quantity).toFixed(2),
              };
            }),
          },
        },
        include: INCLUDE_FULL,
      });

      await decrementStock(input.items);

      ctx.notifier
        .notify({ type: "order.received", order })
        .catch((err) => console.error("[orders] order-received notification failed:", err));

      return order;
    }),

  cancelOrder: publicProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.order.findUniqueOrThrow({ where: { id: input.id } });

      if (existing.status === "cancelled" || existing.status === "refunded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel an order that is already ${existing.status}.`,
        });
      }

      const isRefund = REFUND_STATUSES.includes(existing.status);
      const newStatus = isRefund ? "refunded" : "cancelled";

      // Issue PayPal refund if payment was captured via checkout
      if (existing.paypalCaptureId) {
        await refundPaypalCapture(existing.paypalCaptureId);
      }

      const order = await db.order.update({
        where: { id: input.id },
        data: { status: newStatus },
        include: { orderItems: { include: { product: true } } },
      });

      ctx.notifier
        .notify({ type: "order.cancelled", order, reason: input.reason })
        .catch((err) => console.error("[orders] cancel notification failed:", err));

      const venmoReminder =
        existing.paymentMethod === "venmo"
          ? {
              handle: process.env.NEXT_PUBLIC_VENMO_HANDLE ?? "@evrybites",
              amount: `$${Number(existing.totalAmount).toFixed(2)}`,
            }
          : null;

      return { order, venmoReminder, isRefund };
    }),

  changePaymentMethod: publicProcedure
    .input(z.object({
      id: z.string(),
      newPaymentMethod: z.enum(["venmo", "paypal", "cash", "check"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.order.findUniqueOrThrow({
        where: { id: input.id },
        include: INCLUDE_FULL,
      });

      if (existing.status === "delivered" || existing.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change payment method on a delivered or cancelled order.",
        });
      }

      if (existing.paymentMethod === input.newPaymentMethod) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The order already uses that payment method.",
        });
      }

      // If switching away from a paid PayPal checkout order, refund first
      if (existing.paymentMethod === "paypal" && existing.paypalCaptureId) {
        await refundPaypalCapture(existing.paypalCaptureId);
      }

      const updated = await db.order.update({
        where: { id: input.id },
        data: {
          paymentMethod: input.newPaymentMethod,
          status: "pending_payment",
          paypalCaptureId: null,
          paypalInvoiceId: null,
          paypalOrderId: null,
        },
        include: INCLUDE_FULL,
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://evrybites.com";

      if (input.newPaymentMethod === "venmo") {
        ctx.notifier
          .notify({ type: "order.venmo_payment_requested", order: updated })
          .catch((err) => console.error("[orders] venmo-payment-email failed:", err));
      }

      if (input.newPaymentMethod === "paypal") {
        const paymentUrl = `${baseUrl}/order/pay/${updated.id}`;
        ctx.notifier
          .notify({ type: "order.paypal_payment_requested", order: updated, paymentUrl })
          .catch((err) => console.error("[orders] paypal-payment-email failed:", err));
      }

      return updated;
    }),

  adminSetStatus: publicProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["pending_payment", "received", "processing", "ready", "shipped", "delivered", "cancelled", "refunded"]),
    }))
    .mutation(async ({ input }) => {
      return db.order.update({
        where: { id: input.id },
        data: { status: input.status },
        include: INCLUDE_FULL,
      });
    }),

  logCashCollected: publicProcedure
    .input(z.object({ id: z.string(), amount: z.string() }))
    .mutation(async ({ input }) => {
      return db.order.update({
        where: { id: input.id },
        data: { cashCollected: input.amount },
        include: INCLUDE_FULL,
      });
    }),

  getForPayment: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      const order = await db.order.findUnique({
        where: { id: input.orderId },
        include: INCLUDE_FULL,
      });
      if (!order || order.status !== "pending_payment" || order.paymentMethod !== "paypal") {
        return null;
      }
      return order;
    }),

  createPaypalOrderForExistingOrder: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const order = await db.order.findUniqueOrThrow({ where: { id: input.orderId } });

      if (order.status !== "pending_payment" || order.paymentMethod !== "paypal") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not awaiting PayPal payment." });
      }

      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const accessToken = await getPaypalAccessToken();

      const paypalRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: order.id, amount: { currency_code: "USD", value: Number(order.totalAmount).toFixed(2) } }],
        }),
      });

      if (!paypalRes.ok) {
        const body = await paypalRes.text().catch(() => "(unreadable)");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal error (${paypalRes.status}): ${body}` });
      }

      const paypalOrder = await paypalRes.json() as { id: string };
      await db.order.update({ where: { id: order.id }, data: { paypalOrderId: paypalOrder.id } });
      return { paypalOrderId: paypalOrder.id };
    }),

  capturePaypalPaymentLink: publicProcedure
    .input(z.object({ orderId: z.string(), paypalOrderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const order = await db.order.findUniqueOrThrow({ where: { id: input.orderId } });

      if (order.status !== "pending_payment") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order is not pending payment." });
      }

      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const accessToken = await getPaypalAccessToken();

      const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${input.paypalOrderId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      });

      if (!captureRes.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment capture failed." });
      }

      const captureData = await captureRes.json() as {
        payment_source?: { venmo?: unknown };
        purchase_units?: { payments?: { captures?: { id?: string }[] } }[];
      };

      const actualPaymentMethod = captureData.payment_source?.venmo ? "venmo" : "paypal";
      const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id;

      const updated = await db.order.update({
        where: { id: input.orderId },
        data: {
          status: "received",
          paymentMethod: actualPaymentMethod,
          ...(captureId ? { paypalCaptureId: captureId } : {}),
        },
        include: INCLUDE_FULL,
      });

      // Stock was already decremented when the original order was placed.
      // Use payment_received (not order.received) since the customer already got an order confirmation.
      ctx.notifier
        .notify({ type: "order.payment_received", order: updated })
        .catch((err) => console.error("[orders] payment-received notification failed:", err));

      return updated;
    }),

  sendCustomPaymentLink: publicProcedure
    .input(z.object({
      orderId: z.string(),
      amount: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const order = await db.order.findUnique({
        where: { id: input.orderId },
      });
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const request = await db.customPaymentRequest.create({
        data: {
          orderId: input.orderId,
          amount: input.amount,
        },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://evrybites.com";
      const paymentUrl = `${baseUrl}/order/pay/custom/${request.id}`;

      ctx.notifier
        .notify({ type: "order.custom_payment_requested", order, amount: input.amount, paymentUrl })
        .catch((err) => console.error("[orders] custom-payment-link notification failed:", err));

      return { requestId: request.id };
    }),

  createPaypalOrderForCustomPayment: publicProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ input }) => {
      const request = await db.customPaymentRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Payment request not found" });
      if (request.paid) throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid" });

      const token = await getPaypalAccessToken();
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const paypalBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const amount = Number(request.amount).toFixed(2);

      const res = await fetch(`${paypalBase}/v2/checkout/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: amount } }],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal error: ${text}` });
      }
      const data = await res.json() as { id: string };

      await db.customPaymentRequest.update({
        where: { id: input.requestId },
        data: { paypalOrderId: data.id },
      });

      return { paypalOrderId: data.id };
    }),

  captureCustomPayment: publicProcedure
    .input(z.object({ requestId: z.string(), paypalOrderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const request = await db.customPaymentRequest.findUnique({
        where: { id: input.requestId },
        include: { order: true },
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Payment request not found" });
      if (request.paid) throw new TRPCError({ code: "BAD_REQUEST", message: "Already paid" });

      const token = await getPaypalAccessToken();
      const mode = process.env.PAYPAL_MODE ?? "sandbox";
      const paypalBase = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

      const res = await fetch(`${paypalBase}/v2/checkout/orders/${input.paypalOrderId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal capture error: ${text}` });
      }

      const updated = await db.customPaymentRequest.update({
        where: { id: input.requestId },
        data: { paid: true },
        include: { order: true },
      });

      ctx.notifier
        .notify({ type: "order.custom_payment_received", order: updated.order, amount: Number(updated.amount) })
        .catch((err) => console.error("[orders] custom-payment-received notification failed:", err));

      return { success: true };
    }),

  requestCashCheckApproval: publicProcedure
    .input(z.object({
      userId: z.string(),
      customerName: z.string(),
      customerEmail: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createApprovalToken } = await import("../../lib/approval-token");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://evrybites.com";
      const token = await createApprovalToken(input.userId);
      const approveUrl = `${baseUrl}/api/admin/cash-check?action=approve&token=${encodeURIComponent(token)}`;
      const denyUrl = `${baseUrl}/api/admin/cash-check?action=deny&token=${encodeURIComponent(token)}`;

      await ctx.notifier.notify({
        type: "user.cash_check_requested",
        request: {
          userId: input.userId,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          approveUrl,
          denyUrl,
        },
      });
    }),
});
