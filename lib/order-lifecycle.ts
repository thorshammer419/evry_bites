import type { FulfillmentType, OrderStatus } from "@prisma/client";

type OrderForLifecycle = { status: OrderStatus; fulfillmentType: FulfillmentType };

// Structural transition rules. FulfillmentType governs which terminal
// status is reachable from "ready" — not captured here, enforced below.
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  received: ["confirmed"],
  confirmed: ["ready"],
  ready: ["shipped", "delivered"],
};

export function isValidTransition(
  order: OrderForLifecycle,
  next: OrderStatus
): boolean {
  const allowed = TRANSITIONS[order.status];
  if (!allowed?.includes(next)) return false;
  if (order.status === "ready" && next === "delivered" && order.fulfillmentType !== "local_delivery")
    return false;
  if (order.status === "ready" && next === "shipped" && order.fulfillmentType !== "shipping")
    return false;
  return true;
}

export function nextStatuses(order: OrderForLifecycle): OrderStatus[] {
  return (TRANSITIONS[order.status] ?? []).filter((next) =>
    isValidTransition(order, next)
  );
}

export function isTerminal(status: OrderStatus): boolean {
  return !TRANSITIONS[status];
}
