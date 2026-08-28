import type { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

type OrderForBalance = {
  totalAmount: DecimalLike;
  cashCollected: DecimalLike | null;
  // A non-null paypalCaptureId means the primary PayPal/Venmo checkout
  // already captured the order's full total (every code path that sets
  // it captures the whole order, never a partial amount) — Cash Collected
  // and Custom Payment Requests exist to track payment collected *outside*
  // that primary capture, so they're irrelevant once it's present.
  paypalCaptureId: string | null;
  customPaymentRequests: { amount: DecimalLike; paid: boolean }[];
  // POS split-tender sales (app/admin/pos) record each payment as a Tender
  // instead of using cashCollected/paypalCaptureId — optional so every
  // non-POS call site keeps compiling and behaving identically.
  tenders?: { amount: DecimalLike }[];
};

export function balanceDue(order: OrderForBalance): number {
  if (order.paypalCaptureId) return 0;

  const total = Number(order.totalAmount);
  const cash = order.cashCollected !== null ? Number(order.cashCollected) : 0;
  const paidCustom = order.customPaymentRequests
    .filter((r) => r.paid)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const tendered = (order.tenders ?? []).reduce((sum, t) => sum + Number(t.amount), 0);

  return Math.max(total - cash - paidCustom - tendered, 0);
}
