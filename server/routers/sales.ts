import { z } from "zod";
import type { FulfillmentType, Prisma } from "@prisma/client";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { computeSalesReport, EXCLUDED_STATUSES } from "../../lib/sales-report";

type Channel = "point_of_sale" | "customer_web";

// Sales Channel isn't a stored field — it's derived from Fulfillment Type at
// query time, per the domain glossary (CONTEXT.md).
const FULFILLMENT_TYPES_BY_CHANNEL: Record<Channel, FulfillmentType | { in: FulfillmentType[] }> = {
  point_of_sale: "pickup",
  customer_web: { in: ["local_delivery", "shipping"] },
};

// No date-range filter UI existed until now — the report still defaults to
// the current calendar month when the admin hasn't picked a custom range.
function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function parseUTCDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

// The admin picks an inclusive "to" calendar day, so the exclusive upper
// bound is midnight the following day.
function customDateRange(dateFrom: string, dateTo: string): { start: Date; end: Date } {
  const start = parseUTCDate(dateFrom);
  const end = new Date(parseUTCDate(dateTo).getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Order stores first/last name as separate fields with no single "name"
// column to run one `contains` against, so a multi-word search (e.g. "jan
// smith") requires each token to independently match first-or-last name —
// matching the full-name search semantics the Orders page already has via
// its client-side `[firstName, lastName].join(" ")` check.
function nameCondition(name: string): Prisma.OrderWhereInput {
  const tokenConditions = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" as const } },
        { lastName: { contains: token, mode: "insensitive" as const } },
      ],
    }));
  return tokenConditions.length === 1 ? tokenConditions[0] : { AND: tokenConditions };
}

export const salesRouter = router({
  report: publicProcedure
    .input(
      z
        .object({
          granularity: z.enum(["day", "week", "month", "year"]),
          paymentMethod: z.enum(["venmo", "paypal", "cash", "check"]).optional(),
          channel: z.enum(["point_of_sale", "customer_web"]).optional(),
          productIds: z.array(z.string()).optional(),
          customerName: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
        .refine((v) => Boolean(v.dateFrom) === Boolean(v.dateTo), {
          message: "dateFrom and dateTo must be provided together",
        })
    )
    .query(async ({ input }) => {
      const { start, end } =
        input.dateFrom && input.dateTo
          ? customDateRange(input.dateFrom, input.dateTo)
          : currentMonthRange();

      // Every filter is its own independent, AND-composed condition, so any
      // subset can be active at once without one filter's OR clobbering
      // another's (payment/channel/product/name each stay isolated).
      const conditions: Prisma.OrderWhereInput[] = [
        { OR: [{ receivedAt: { gte: start, lt: end } }, { refundedAt: { gte: start, lt: end } }] },
      ];
      if (input.paymentMethod) {
        conditions.push({ paymentMethod: input.paymentMethod });
      }
      if (input.channel) {
        conditions.push({ fulfillmentType: FULFILLMENT_TYPES_BY_CHANNEL[input.channel] });
      }
      if (input.productIds && input.productIds.length > 0) {
        conditions.push({ orderItems: { some: { productId: { in: input.productIds } } } });
      }
      if (input.customerName) {
        conditions.push(nameCondition(input.customerName));
      }

      const orders = await db.order.findMany({
        where: { status: { notIn: EXCLUDED_STATUSES }, AND: conditions },
        select: { status: true, receivedAt: true, refundedAt: true, totalAmount: true },
      });

      // An order can match the query above via one side (e.g. refunded this
      // month) while its other side (e.g. received last month) falls outside
      // the current view — drop the out-of-range side so it doesn't leak a
      // bucket outside the selected view. computeSalesReport already treats
      // a null receivedAt/refundedAt as "no contribution on that side".
      const scoped = orders.map((order) => ({
        ...order,
        receivedAt:
          order.receivedAt && order.receivedAt >= start && order.receivedAt < end
            ? order.receivedAt
            : null,
        refundedAt:
          order.refundedAt && order.refundedAt >= start && order.refundedAt < end
            ? order.refundedAt
            : null,
      }));

      return computeSalesReport(scoped, input.granularity);
    }),
});
