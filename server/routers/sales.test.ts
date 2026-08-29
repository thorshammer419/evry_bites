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
  vi.mocked(db.order.findMany).mockReset();
  vi.mocked(db.order.findMany).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("salesRouter.report", () => {
  it("queries only non-excluded orders whose receivedAt or refundedAt falls in the current month", async () => {
    await caller.sales.report({ granularity: "month" });

    expect(db.order.findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["pending_payment", "cancelled"] },
        AND: [
          {
            OR: [
              { receivedAt: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") } },
              { refundedAt: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") } },
            ],
          },
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

  it("filters by payment method", async () => {
    await caller.sales.report({ granularity: "month", paymentMethod: "cash" });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({ paymentMethod: "cash" });
  });

  it("filters by sales channel, mapping Point of Sale to pickup orders", async () => {
    await caller.sales.report({ granularity: "month", channel: "point_of_sale" });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({ fulfillmentType: "pickup" });
  });

  it("filters by sales channel, mapping Customer Web to local_delivery or shipping orders", async () => {
    await caller.sales.report({ granularity: "month", channel: "customer_web" });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({ fulfillmentType: { in: ["local_delivery", "shipping"] } });
  });

  it("filters by one or more product ids via a join against order line items", async () => {
    await caller.sales.report({ granularity: "month", productIds: ["prod-1", "prod-2"] });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({
      orderItems: { some: { productId: { in: ["prod-1", "prod-2"] } } },
    });
  });

  it("ignores an empty product id list rather than matching no orders", async () => {
    await caller.sales.report({ granularity: "month", productIds: [] });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).not.toContainEqual(
      expect.objectContaining({ orderItems: expect.anything() })
    );
  });

  it("filters by customer name via a case-insensitive partial match on first or last name", async () => {
    await caller.sales.report({ granularity: "month", customerName: "jan" });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({
      OR: [
        { firstName: { contains: "jan", mode: "insensitive" } },
        { lastName: { contains: "jan", mode: "insensitive" } },
      ],
    });
  });

  it("matches a full 'first last' name search the way the Orders page's search does", async () => {
    await caller.sales.report({ granularity: "month", customerName: "jan smith" });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    // Each space-separated token must match first-or-last name independently,
    // so "Jan Smith" (firstName "Jan", lastName "Smith") matches even though
    // no single stored field contains the full "jan smith" substring.
    expect(where!.AND).toContainEqual({
      AND: [
        {
          OR: [
            { firstName: { contains: "jan", mode: "insensitive" } },
            { lastName: { contains: "jan", mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { firstName: { contains: "smith", mode: "insensitive" } },
            { lastName: { contains: "smith", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it("replaces the default current-month view with a custom date range", async () => {
    await caller.sales.report({ granularity: "day", dateFrom: "2026-01-01", dateTo: "2026-01-03" });

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { receivedAt: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2026-01-04T00:00:00Z") } },
                { refundedAt: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2026-01-04T00:00:00Z") } },
              ],
            },
          ]),
        }),
      })
    );
  });

  it("rejects a date range with only one end supplied", async () => {
    await expect(
      caller.sales.report({ granularity: "day", dateFrom: "2026-01-01" })
    ).rejects.toThrow();
  });

  it("composes multiple filters together with AND", async () => {
    await caller.sales.report({
      granularity: "month",
      paymentMethod: "venmo",
      channel: "customer_web",
      customerName: "smith",
    });

    const { where } = vi.mocked(db.order.findMany).mock.calls[0][0]!;
    expect(where!.AND).toContainEqual({ paymentMethod: "venmo" });
    expect(where!.AND).toContainEqual({ fulfillmentType: { in: ["local_delivery", "shipping"] } });
    expect(where!.AND).toContainEqual({
      OR: [
        { firstName: { contains: "smith", mode: "insensitive" } },
        { lastName: { contains: "smith", mode: "insensitive" } },
      ],
    });
  });
});
