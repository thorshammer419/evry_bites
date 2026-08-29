import type { Prisma, OrderStatus } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

export type Granularity = "day" | "week" | "month" | "year";

type OrderForSalesReport = {
  status: OrderStatus;
  // Set exactly once, the moment the order first reached `received` — null
  // for orders still pending_payment or cancelled before ever being received.
  receivedAt: Date | string | null;
  // Set exactly once, the moment the order reached the terminal `refunded`
  // status — null for every order that hasn't been refunded.
  refundedAt: Date | string | null;
  totalAmount: DecimalLike;
};

export type SalesReportRow = {
  // Bucket start as an ISO date (YYYY-MM-DD), also usable as a stable sort/react key.
  periodStart: string;
  periodLabel: string;
  salesCount: number;
  salesRevenue: number;
  refundsCount: number;
  refundsTotal: number;
  netRevenue: number;
};

// pending_payment orders never had a payment collected, and cancelled orders
// never completed one either — neither is a Sale or a Refund at any point.
// Exported so the router can apply the same exclusion at the database query
// level without restating the status list.
export const EXCLUDED_STATUSES: OrderStatus[] = ["pending_payment", "cancelled"];
const excludedStatusSet = new Set(EXCLUDED_STATUSES);

type Bucket = {
  start: Date;
  salesCount: number;
  salesRevenue: number;
  refundsCount: number;
  refundsTotal: number;
};

// Buckets by calendar date in UTC so a fixed instant always lands in the same
// bucket regardless of the server/test-runner's local timezone.
function bucketStart(date: Date, granularity: Granularity): Date {
  const utcDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  switch (granularity) {
    case "day":
      return utcDay;
    case "week": {
      const start = new Date(utcDay);
      start.setUTCDate(utcDay.getUTCDate() - utcDay.getUTCDay());
      return start;
    }
    case "month":
      return new Date(Date.UTC(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), 1));
    case "year":
      return new Date(Date.UTC(utcDay.getUTCFullYear(), 0, 1));
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatLabel(start: Date, granularity: Granularity): string {
  switch (granularity) {
    case "day":
      return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    case "week": {
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
      return `${startLabel} – ${endLabel}`;
    }
    case "month":
      return start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    case "year":
      return String(start.getUTCFullYear());
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSalesReport(
  orders: OrderForSalesReport[],
  granularity: Granularity
): SalesReportRow[] {
  const buckets = new Map<string, Bucket>();

  function bucketFor(date: Date): Bucket {
    const start = bucketStart(date, granularity);
    const key = isoDate(start);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { start, salesCount: 0, salesRevenue: 0, refundsCount: 0, refundsTotal: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const order of orders) {
    if (excludedStatusSet.has(order.status)) continue;

    const total = Number(order.totalAmount);

    // A Sale is attributed to the period it was received in — gross, so a
    // later refund never revises a past period's sales figures.
    if (order.receivedAt) {
      const bucket = bucketFor(new Date(order.receivedAt));
      bucket.salesCount += 1;
      bucket.salesRevenue += total;
    }

    // A Refund is attributed separately, to the period it was refunded in —
    // which may be a different bucket entirely than the original Sale.
    if (order.status === "refunded" && order.refundedAt) {
      const bucket = bucketFor(new Date(order.refundedAt));
      bucket.refundsCount += 1;
      bucket.refundsTotal += total;
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.start.getTime() - b.start.getTime())
    .map(([periodStart, bucket]) => ({
      periodStart,
      periodLabel: formatLabel(bucket.start, granularity),
      salesCount: bucket.salesCount,
      salesRevenue: round2(bucket.salesRevenue),
      refundsCount: bucket.refundsCount,
      refundsTotal: round2(bucket.refundsTotal),
      netRevenue: round2(bucket.salesRevenue - bucket.refundsTotal),
    }));
}
