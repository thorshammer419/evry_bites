import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { computeSalesReport, EXCLUDED_STATUSES } from "../../lib/sales-report";

// No date-range filter UI exists yet (that's a later ticket) — the report
// defaults to the current calendar month so the page loads with a sensible,
// bounded view instead of every order ever placed.
function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export const salesRouter = router({
  report: publicProcedure
    .input(z.object({ granularity: z.enum(["day", "week", "month", "year"]) }))
    .query(async ({ input }) => {
      const { start, end } = currentMonthRange();

      const orders = await db.order.findMany({
        where: {
          status: { notIn: EXCLUDED_STATUSES },
          OR: [
            { receivedAt: { gte: start, lt: end } },
            { refundedAt: { gte: start, lt: end } },
          ],
        },
        select: { status: true, receivedAt: true, refundedAt: true, totalAmount: true },
      });

      // An order can match the query above via one side (e.g. refunded this
      // month) while its other side (e.g. received last month) falls outside
      // the current-month view — drop the out-of-range side so it doesn't
      // leak a bucket outside the default view. computeSalesReport already
      // treats a null receivedAt/refundedAt as "no contribution on that side".
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
