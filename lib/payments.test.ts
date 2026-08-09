import { describe, it, expect } from "vitest";
import { balanceDue } from "./payments";

function order({
  totalAmount,
  cashCollected = null,
  paypalCaptureId = null,
  customPaymentRequests = [],
}: {
  totalAmount: number | string;
  cashCollected?: number | string | null;
  paypalCaptureId?: string | null;
  customPaymentRequests?: { amount: number | string; paid: boolean }[];
}) {
  return { totalAmount, cashCollected, paypalCaptureId, customPaymentRequests };
}

describe("balanceDue", () => {
  it("returns the full total when nothing has been collected", () => {
    expect(balanceDue(order({ totalAmount: 50 }))).toBe(50);
  });

  it("subtracts cash collected", () => {
    expect(balanceDue(order({ totalAmount: 50, cashCollected: 20 }))).toBe(30);
  });

  it("is zero when cash collected fully covers the total", () => {
    expect(balanceDue(order({ totalAmount: 50, cashCollected: 50 }))).toBe(0);
  });

  it("subtracts only paid custom payment requests, ignoring pending ones", () => {
    const result = balanceDue(
      order({
        totalAmount: 50,
        customPaymentRequests: [
          { amount: 20, paid: true },
          { amount: 30, paid: false },
        ],
      })
    );
    expect(result).toBe(30);
  });

  it("subtracts cash collected and paid custom payment requests together", () => {
    const result = balanceDue(
      order({
        totalAmount: 50,
        cashCollected: 20,
        customPaymentRequests: [{ amount: 20, paid: true }],
      })
    );
    expect(result).toBe(10);
  });

  it("is zero when paid custom payment requests exactly cover the total", () => {
    const result = balanceDue(
      order({
        totalAmount: 50,
        customPaymentRequests: [
          { amount: 20, paid: true },
          { amount: 30, paid: true },
        ],
      })
    );
    expect(result).toBe(0);
  });

  it("clamps at zero rather than going negative on cash overpayment", () => {
    expect(balanceDue(order({ totalAmount: 50, cashCollected: 60 }))).toBe(0);
  });

  it("clamps at zero rather than going negative on combined overpayment", () => {
    const result = balanceDue(
      order({
        totalAmount: 50,
        cashCollected: 30,
        customPaymentRequests: [{ amount: 30, paid: true }],
      })
    );
    expect(result).toBe(0);
  });

  it("is zero when the primary PayPal/Venmo checkout already captured the full total", () => {
    // Every code path that sets paypalCaptureId captures the order's full
    // total, so no cash or custom-payment tracking is relevant once it's set.
    const result = balanceDue(order({ totalAmount: 50, paypalCaptureId: "CAPTURE-1" }));
    expect(result).toBe(0);
  });

  it("ignores cash/custom-payment fields once paypalCaptureId is set", () => {
    const result = balanceDue(
      order({
        totalAmount: 50,
        paypalCaptureId: "CAPTURE-1",
        cashCollected: 0,
        customPaymentRequests: [{ amount: 10, paid: false }],
      })
    );
    expect(result).toBe(0);
  });

  it("accepts decimal-string amounts, as Prisma Decimal fields serialize", () => {
    const result = balanceDue(
      order({
        totalAmount: "50.00",
        cashCollected: "12.50",
        customPaymentRequests: [{ amount: "7.50", paid: true }],
      })
    );
    expect(result).toBe(30);
  });
});
