import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { isValidTransition } from "../../lib/order-lifecycle";

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

export const ordersRouter = router({
  listAll: publicProcedure.query(() =>
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: INCLUDE_FULL,
    })
  ),

  updateStatus: publicProcedure
    .input(z.object({ id: z.string(), status: z.enum(["confirmed", "ready", "shipped", "delivered"]) }))
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
        data: { status: input.status },
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
        purchase_units?: { payments?: { captures?: { seller_receivable_breakdown?: { paypal_fee?: { value?: string } } }[] } }[];
      };

      const actualPaymentMethod = captureData.payment_source?.venmo ? "venmo" : "paypal";

      const order = await db.order.update({
        where: { id: input.orderId },
        data: { status: "received", paymentMethod: actualPaymentMethod },
        include: { orderItems: { include: { product: true } } },
      });

      await decrementStock(order.orderItems.map(i => ({ productId: i.productId, quantity: i.quantity })));

      ctx.notifier
        .notify({ type: "order.received", order })
        .catch((err) => console.error("[orders] order-received notification failed:", err));

      return order;
    }),

  cancelOrder: publicProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const order = await db.order.update({
        where: { id: input.id },
        data: { status: "cancelled" },
        include: { orderItems: { include: { product: true } } },
      });

      ctx.notifier
        .notify({ type: "order.cancelled", order, reason: input.reason })
        .catch((err) => console.error("[orders] cancel notification failed:", err));

      return order;
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
