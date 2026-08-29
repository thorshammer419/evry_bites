import { describe, it, expect } from "vitest";
import { computeSalesReport, type Granularity } from "./sales-report";
import type { OrderStatus } from "@prisma/client";

function order({
  status = "received",
  receivedAt = null,
  refundedAt = null,
  totalAmount,
}: {
  status?: OrderStatus;
  receivedAt?: string | null;
  refundedAt?: string | null;
  totalAmount: number | string;
}) {
  return { status, receivedAt, refundedAt, totalAmount };
}

describe("computeSalesReport", () => {
  it("returns no rows for an empty order set", () => {
    expect(computeSalesReport([], "day")).toEqual([]);
  });

  it("excludes pending_payment orders from every metric", () => {
    const rows = computeSalesReport(
      [order({ status: "pending_payment", receivedAt: null, totalAmount: 50 })],
      "day"
    );
    expect(rows).toEqual([]);
  });

  it("excludes cancelled orders from every metric", () => {
    const rows = computeSalesReport(
      [order({ status: "cancelled", receivedAt: null, totalAmount: 50 })],
      "day"
    );
    expect(rows).toEqual([]);
  });

  it("counts a received order as one sale in its receivedAt day bucket", () => {
    const rows = computeSalesReport(
      [order({ receivedAt: "2026-03-10T14:00:00Z", totalAmount: 25 })],
      "day"
    );
    expect(rows).toEqual([
      expect.objectContaining({
        periodStart: "2026-03-10",
        salesCount: 1,
        salesRevenue: 25,
        refundsCount: 0,
        refundsTotal: 0,
        netRevenue: 25,
      }),
    ]);
  });

  it("sums sales revenue across multiple orders in the same bucket", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-10T09:00:00Z", totalAmount: 20 }),
        order({ receivedAt: "2026-03-10T18:00:00Z", totalAmount: 30 }),
      ],
      "day"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].salesCount).toBe(2);
    expect(rows[0].salesRevenue).toBe(50);
  });

  it("splits orders received on different days into separate buckets, sorted ascending", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-12T09:00:00Z", totalAmount: 10 }),
        order({ receivedAt: "2026-03-10T09:00:00Z", totalAmount: 20 }),
      ],
      "day"
    );
    expect(rows.map((r) => r.periodStart)).toEqual(["2026-03-10", "2026-03-12"]);
  });

  it("attributes a refunded order's sale and refund to their own, possibly different, periods", () => {
    const rows = computeSalesReport(
      [
        order({
          status: "refunded",
          receivedAt: "2026-03-10T09:00:00Z",
          refundedAt: "2026-04-02T09:00:00Z",
          totalAmount: 40,
        }),
      ],
      "day"
    );
    expect(rows).toEqual([
      expect.objectContaining({
        periodStart: "2026-03-10",
        salesCount: 1,
        salesRevenue: 40,
        refundsCount: 0,
        refundsTotal: 0,
        netRevenue: 40,
      }),
      expect.objectContaining({
        periodStart: "2026-04-02",
        salesCount: 0,
        salesRevenue: 0,
        refundsCount: 1,
        refundsTotal: 40,
        netRevenue: -40,
      }),
    ]);
  });

  it("still counts a refunded order's original sale gross, not netted out of its own period", () => {
    const rows = computeSalesReport(
      [
        order({
          status: "refunded",
          receivedAt: "2026-03-10T09:00:00Z",
          refundedAt: "2026-03-10T15:00:00Z",
          totalAmount: 40,
        }),
      ],
      "day"
    );
    expect(rows).toEqual([
      expect.objectContaining({
        periodStart: "2026-03-10",
        salesCount: 1,
        salesRevenue: 40,
        refundsCount: 1,
        refundsTotal: 40,
        netRevenue: 0,
      }),
    ]);
  });

  it("computes net revenue as sales revenue minus refunds total", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-10T09:00:00Z", totalAmount: 100 }),
        order({
          status: "refunded",
          receivedAt: "2026-02-01T09:00:00Z",
          refundedAt: "2026-03-10T09:00:00Z",
          totalAmount: 30,
        }),
      ],
      "day"
    );
    const march10 = rows.find((r) => r.periodStart === "2026-03-10");
    expect(march10).toMatchObject({ salesRevenue: 100, refundsTotal: 30, netRevenue: 70 });
  });

  it("buckets by week starting Sunday", () => {
    // 2026-03-10 is a Tuesday; its week starts Sunday 2026-03-08.
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-08T00:00:00Z", totalAmount: 10 }),
        order({ receivedAt: "2026-03-10T00:00:00Z", totalAmount: 10 }),
        order({ receivedAt: "2026-03-14T23:59:59Z", totalAmount: 10 }),
      ],
      "week"
    );
    expect(rows).toEqual([
      expect.objectContaining({ periodStart: "2026-03-08", salesCount: 3, salesRevenue: 30 }),
    ]);
  });

  it("buckets by calendar month", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-01T00:00:00Z", totalAmount: 10 }),
        order({ receivedAt: "2026-03-31T23:59:59Z", totalAmount: 10 }),
        order({ receivedAt: "2026-04-01T00:00:00Z", totalAmount: 10 }),
      ],
      "month"
    );
    expect(rows).toEqual([
      expect.objectContaining({ periodStart: "2026-03-01", salesCount: 2, salesRevenue: 20 }),
      expect.objectContaining({ periodStart: "2026-04-01", salesCount: 1, salesRevenue: 10 }),
    ]);
  });

  it("buckets by calendar year", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-01-01T00:00:00Z", totalAmount: 10 }),
        order({ receivedAt: "2026-12-31T23:59:59Z", totalAmount: 10 }),
        order({ receivedAt: "2027-01-01T00:00:00Z", totalAmount: 10 }),
      ],
      "year"
    );
    expect(rows).toEqual([
      expect.objectContaining({ periodStart: "2026-01-01", salesCount: 2, salesRevenue: 20 }),
      expect.objectContaining({ periodStart: "2027-01-01", salesCount: 1, salesRevenue: 10 }),
    ]);
  });

  it("rounds revenue figures to two decimal places", () => {
    const rows = computeSalesReport(
      [
        order({ receivedAt: "2026-03-10T00:00:00Z", totalAmount: 10.1 }),
        order({ receivedAt: "2026-03-10T00:00:00Z", totalAmount: 10.2 }),
      ],
      "day"
    );
    expect(rows[0].salesRevenue).toBe(20.3);
  });

  it("accepts decimal-string amounts, as Prisma Decimal fields serialize", () => {
    const rows = computeSalesReport(
      [order({ receivedAt: "2026-03-10T00:00:00Z", totalAmount: "19.99" })],
      "day"
    );
    expect(rows[0].salesRevenue).toBe(19.99);
  });

  it.each<Granularity>(["day", "week", "month", "year"])(
    "produces no rows when no order has a receivedAt or refundedAt (%s)",
    (granularity) => {
      const rows = computeSalesReport(
        [order({ status: "pending_payment", totalAmount: 10 })],
        granularity
      );
      expect(rows).toEqual([]);
    }
  );
});
