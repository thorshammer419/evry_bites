import type { FulfillmentType, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

export type Granularity = "day" | "week" | "month" | "year";
export type GroupBy = "none" | "paymentMethod" | "product" | "channel";

// A reporting-only grouping derived from Fulfillment Type, not a stored
// field — see the Sales Channel glossary entry in CONTEXT.md.
export type Channel = "point_of_sale" | "customer_web";

const CHANNEL_BY_FULFILLMENT_TYPE: Record<FulfillmentType, Channel> = {
  pickup: "point_of_sale",
  local_delivery: "customer_web",
  shipping: "customer_web",
};

export function channelForFulfillmentType(type: FulfillmentType): Channel {
  return CHANNEL_BY_FULFILLMENT_TYPE[type];
}

type OrderLineItemForSalesReport = {
  productId: string;
  quantity: number;
  subtotal: DecimalLike;
};

type OrderForSalesReport = {
  status: OrderStatus;
  // Set exactly once, the moment the order first reached `received` — null
  // for orders still pending_payment or cancelled before ever being received.
  receivedAt: Date | string | null;
  // Set exactly once, the moment the order reached the terminal `refunded`
  // status — null for every order that hasn't been refunded.
  refundedAt: Date | string | null;
  totalAmount: DecimalLike;
  // Only consulted when grouping by that dimension; omitted by tests that
  // don't exercise group-by.
  paymentMethod?: PaymentMethod;
  fulfillmentType?: FulfillmentType;
  orderItems?: OrderLineItemForSalesReport[];
};

export type SalesReportRow = {
  // Bucket start as an ISO date (YYYY-MM-DD), also usable as a stable sort/react key.
  periodStart: string;
  periodLabel: string;
  // The row's category value when grouped (a payment method, a channel, or a
  // product id) — null for the ungrouped report.
  groupKey: string | null;
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
  groupKey: string | null;
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

function attributeSale(bucket: Bucket, count: number, revenue: number): void {
  bucket.salesCount += count;
  bucket.salesRevenue += revenue;
}

function attributeRefund(bucket: Bucket, count: number, revenue: number): void {
  bucket.refundsCount += count;
  bucket.refundsTotal += revenue;
}

export function computeSalesReport(
  orders: OrderForSalesReport[],
  granularity: Granularity,
  groupBy: GroupBy = "none",
  // When grouping by product while a product filter is active, only the
  // filtered-in products should get their own row — an order can qualify for
  // the filter via one product while also containing others the admin didn't
  // ask about. This only decides which rows get emitted; it must not affect
  // itemsSubtotalSum below, which still needs every item in the order to
  // compute a fair refund share for the ones that do get emitted.
  productIdFilter?: string[]
): SalesReportRow[] {
  const buckets = new Map<string, Bucket>();

  function bucketFor(date: Date, groupKey: string | null): Bucket {
    const start = bucketStart(date, granularity);
    const key = `${isoDate(start)}::${groupKey ?? ""}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { start, groupKey, salesCount: 0, salesRevenue: 0, refundsCount: 0, refundsTotal: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const order of orders) {
    if (excludedStatusSet.has(order.status)) continue;

    const total = Number(order.totalAmount);
    const isRefunded = order.status === "refunded" && Boolean(order.refundedAt);

    if (groupBy === "product") {
      // A product-line-item's own subtotal is already an exact dollar figure
      // for that product, so a Sale uses it directly. A Refund has no such
      // per-item figure — Order Cancellation refunds the whole order — so it
      // must be approximated: each item's share of the order's *other line
      // items* (not of totalAmount, which may include fees no item reflects)
      // applied to the order's totalAmount.
      const itemsSubtotalSum = (order.orderItems ?? []).reduce((sum, item) => sum + Number(item.subtotal), 0);

      for (const item of order.orderItems ?? []) {
        if (productIdFilter && !productIdFilter.includes(item.productId)) continue;

        const itemSubtotal = Number(item.subtotal);
        const share = itemsSubtotalSum > 0 ? itemSubtotal / itemsSubtotalSum : 0;

        if (order.receivedAt) {
          attributeSale(bucketFor(new Date(order.receivedAt), item.productId), item.quantity, itemSubtotal);
        }
        if (isRefunded) {
          attributeRefund(bucketFor(new Date(order.refundedAt!), item.productId), item.quantity, share * total);
        }
      }
      continue;
    }

    const groupKey =
      groupBy === "paymentMethod"
        ? (order.paymentMethod ?? null)
        : groupBy === "channel" && order.fulfillmentType
          ? channelForFulfillmentType(order.fulfillmentType)
          : null;

    // A Sale is attributed to the period it was received in — gross, so a
    // later refund never revises a past period's sales figures.
    if (order.receivedAt) {
      attributeSale(bucketFor(new Date(order.receivedAt), groupKey), 1, total);
    }

    // A Refund is attributed separately, to the period it was refunded in —
    // which may be a different bucket entirely than the original Sale.
    if (isRefunded) {
      attributeRefund(bucketFor(new Date(order.refundedAt!), groupKey), 1, total);
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.start.getTime() - b.start.getTime() || (a.groupKey ?? "").localeCompare(b.groupKey ?? ""))
    .map((bucket) => ({
      periodStart: isoDate(bucket.start),
      periodLabel: formatLabel(bucket.start, granularity),
      groupKey: bucket.groupKey,
      salesCount: bucket.salesCount,
      salesRevenue: round2(bucket.salesRevenue),
      refundsCount: bucket.refundsCount,
      refundsTotal: round2(bucket.refundsTotal),
      netRevenue: round2(bucket.salesRevenue - bucket.refundsTotal),
    }));
}
