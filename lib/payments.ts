import type { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

type OrderForBalance = {
  totalAmount: DecimalLike;
  cashCollected: DecimalLike | null;
  customPaymentRequests: { amount: DecimalLike; paid: boolean }[];
};

export function balanceDue(order: OrderForBalance): number {
  const total = Number(order.totalAmount);
  const cash = order.cashCollected !== null ? Number(order.cashCollected) : 0;
  const paidCustom = order.customPaymentRequests
    .filter((r) => r.paid)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return Math.max(total - cash - paidCustom, 0);
}
