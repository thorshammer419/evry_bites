import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";
import { db } from "../../lib/db";

vi.mock("../../lib/db", () => ({
  db: {
    order: {
      findMany: vi.fn(),
    },
  },
}));

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({ notifier: { notify: vi.fn().mockResolvedValue(undefined) } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("salesRouter.report", () => {
  it("queries only non-excluded orders whose receivedAt or refundedAt falls in the current month", async () => {
    vi.mocked(db.order.findMany).mockResolvedValue([]);

    await caller.sales.report({ granularity: "month" });

    expect(db.order.findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["pending_payment", "cancelled"] },
        OR: [
          { receivedAt: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") } },
          { refundedAt: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") } },
        ],
      },
      select: { status: true, receivedAt: true, refundedAt: true, totalAmount: true },
    });
  });

  it("drops an order's out-of-range side so a prior month's sale doesn't leak into the current-month refund view", async () => {
    vi.mocked(db.order.findMany).mockResolvedValue([
      {
        status: "refunded",
        receivedAt: new Date("2026-07-28T09:00:00Z"),
        refundedAt: new Date("2026-08-12T16:00:00Z"),
        totalAmount: "15.00",
      },
    ] as never);

    const rows = await caller.sales.report({ granularity: "month" });

    expect(rows).toEqual([
      expect.objectContaining({
        periodStart: "2026-08-01",
        salesCount: 0,
        salesRevenue: 0,
        refundsCount: 1,
        refundsTotal: 15,
        netRevenue: -15,
      }),
    ]);
  });
});
