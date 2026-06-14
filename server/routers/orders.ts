import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { OrderStatus, FulfillmentType } from "@prisma/client";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { sendStatusNotification, sendOrderReceivedNotifications } from "../../lib/notifications";

const INCLUDE_FULL = {
  orderItems: { include: { product: true } },
} as const;

// Legal status transitions; fulfillment type governs the ready → terminal split
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  received: ["confirmed"],
  confirmed: ["ready"],
  ready: ["shipped", "delivered"],
};

function isValidTransition(
  current: OrderStatus,
  next: OrderStatus,
  fulfillmentType: FulfillmentType
): boolean {
  const allowed = TRANSITIONS[current];
  if (!allowed?.includes(next)) return false;
  if (current === "ready" && next === "delivered" && fulfillmentType !== "local_delivery")
    return false;
  if (current === "ready" && next === "shipped" && fulfillmentType !== "shipping")
    return false;
  return true;
}

const submitInputSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(1),
  fulfillmentType: z.enum(["local_delivery", "shipping"]),
  address: z.string().min(1),
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

export const ordersRouter = router({
  listAll: publicProcedure.query(() =>
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      include: INCLUDE_FULL,
    })
  ),

  updateStatus: publicProcedure
    .input(z.object({ id: z.string(), status: z.enum(["confirmed", "ready", "shipped", "delivered"]) }))
    .mutation(async ({ input }) => {
      const order = await db.order.findUniqueOrThrow({
        where: { id: input.id },
        include: INCLUDE_FULL,
      });

      if (!isValidTransition(order.status, input.status, order.fulfillmentType)) {
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

      await sendStatusNotification(updated, input.status);

      return updated;
    }),

  submit: publicProcedure
    .input(submitInputSchema)
    .mutation(async ({ input }) => {
      const productIds = input.items.map((i) => i.productId);

      const products = await db.product.findMany({
        where: { id: { in: productIds } },
      });

      // Validate all products exist and are active
      const productMap: Record<string, (typeof products)[number]> = {};
      for (const product of products) {
        productMap[product.id] = product;
      }

      for (const item of input.items) {
        const product = productMap[item.productId];
        if (!product || !product.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more items are no longer available.",
          });
        }
      }

      // Compute prices server-side
      let totalAmount = 0;
      for (const item of input.items) {
        const product = productMap[item.productId];
        const unitPrice = Number(product.price);
        totalAmount += unitPrice * item.quantity;
      }

      const order = await db.order.create({
        data: {
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          fulfillmentType: input.fulfillmentType,
          address: input.address,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          totalAmount: totalAmount.toFixed(2),
          orderItems: {
            create: input.items.map((item) => {
              const product = productMap[item.productId];
              const unitPrice = Number(product.price);
              const subtotal = unitPrice * item.quantity;
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: unitPrice.toFixed(2),
                subtotal: subtotal.toFixed(2),
              };
            }),
          },
        },
        include: { orderItems: { include: { product: true } } },
      });

      // Fire-and-forget: don't block the submit response on notification delivery
      sendOrderReceivedNotifications(order).catch((err) =>
        console.error("[orders] order-received notification failed:", err)
      );

      return order;
    }),
});
