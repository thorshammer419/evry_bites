import type { FulfillmentType, OrderStatus } from "@prisma/client";

type OrderForLifecycle = { status: OrderStatus; fulfillmentType: FulfillmentType };

// Forward cycle: pending_payment → received → processing → ready → shipped → delivered
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending_payment: "received",
  received: "processing",
  processing: "ready",
  ready: "shipped",
  shipped: "delivered",
};

// Backward cycle — received has no backward step (pending_payment is not meaningful once received)
const PREV: Partial<Record<OrderStatus, OrderStatus>> = {
  processing: "received",
  ready: "processing",
  shipped: "ready",
  delivered: "shipped",
};

export function nextStatus(order: OrderForLifecycle): OrderStatus | null {
  return NEXT[order.status] ?? null;
}

export function previousStatus(order: OrderForLifecycle): OrderStatus | null {
  return PREV[order.status] ?? null;
}

export function isValidTransition(
  order: OrderForLifecycle,
  next: OrderStatus
): boolean {
  return NEXT[order.status] === next || PREV[order.status] === next;
}

export function nextStatuses(order: OrderForLifecycle): OrderStatus[] {
  const n = NEXT[order.status];
  return n ? [n] : [];
}

export function isTerminal(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}
