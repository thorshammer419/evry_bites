import { describe, it, expect } from "vitest";
import { isValidTransition, nextStatuses, nextStatus, previousStatus, isTerminal } from "./order-lifecycle";
import type { FulfillmentType, OrderStatus } from "@prisma/client";

function order(status: OrderStatus, fulfillmentType: FulfillmentType = "local_delivery") {
  return { status, fulfillmentType };
}

describe("nextStatus", () => {
  it("returns correct next for each forward step", () => {
    expect(nextStatus(order("pending_payment"))).toBe("received");
    expect(nextStatus(order("received"))).toBe("processing");
    expect(nextStatus(order("processing"))).toBe("ready");
    expect(nextStatus(order("ready"))).toBe("shipped");
    expect(nextStatus(order("shipped"))).toBe("delivered");
  });

  it("returns null for terminal and cancelled statuses", () => {
    expect(nextStatus(order("delivered"))).toBeNull();
    expect(nextStatus(order("cancelled"))).toBeNull();
  });
});

describe("previousStatus", () => {
  it("returns correct previous for reversible statuses", () => {
    expect(previousStatus(order("processing"))).toBe("received");
    expect(previousStatus(order("ready"))).toBe("processing");
    expect(previousStatus(order("shipped"))).toBe("ready");
    expect(previousStatus(order("delivered"))).toBe("shipped");
  });

  it("returns null for statuses with no backward step", () => {
    expect(previousStatus(order("received"))).toBeNull();
    expect(previousStatus(order("pending_payment"))).toBeNull();
    expect(previousStatus(order("cancelled"))).toBeNull();
  });
});

describe("isValidTransition", () => {
  it("allows all forward steps", () => {
    expect(isValidTransition(order("pending_payment"), "received")).toBe(true);
    expect(isValidTransition(order("received"), "processing")).toBe(true);
    expect(isValidTransition(order("processing"), "ready")).toBe(true);
    expect(isValidTransition(order("ready"), "shipped")).toBe(true);
    expect(isValidTransition(order("shipped"), "delivered")).toBe(true);
  });

  it("allows backward steps", () => {
    expect(isValidTransition(order("processing"), "received")).toBe(true);
    expect(isValidTransition(order("ready"), "processing")).toBe(true);
    expect(isValidTransition(order("shipped"), "ready")).toBe(true);
    expect(isValidTransition(order("delivered"), "shipped")).toBe(true);
  });

  it("rejects skipping states forward", () => {
    expect(isValidTransition(order("received"), "ready")).toBe(false);
    expect(isValidTransition(order("received"), "delivered")).toBe(false);
  });

  it("rejects skipping states backward", () => {
    expect(isValidTransition(order("ready"), "received")).toBe(false);
  });

  it("rejects transition from terminal delivered", () => {
    expect(isValidTransition(order("delivered"), "processing")).toBe(false);
  });

  it("rejects backward from received (no step to pending_payment)", () => {
    expect(isValidTransition(order("received"), "pending_payment")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("returns single-element array for each forward status", () => {
    expect(nextStatuses(order("received"))).toEqual(["processing"]);
    expect(nextStatuses(order("processing"))).toEqual(["ready"]);
    expect(nextStatuses(order("ready"))).toEqual(["shipped"]);
    expect(nextStatuses(order("shipped"))).toEqual(["delivered"]);
  });

  it("returns [] for delivered and cancelled", () => {
    expect(nextStatuses(order("delivered"))).toEqual([]);
    expect(nextStatuses(order("cancelled"))).toEqual([]);
  });
});

describe("isTerminal", () => {
  it("returns true for delivered and cancelled", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("returns false for shipped (now has a next step)", () => {
    expect(isTerminal("shipped")).toBe(false);
  });

  it("returns false for non-terminal statuses", () => {
    expect(isTerminal("received")).toBe(false);
    expect(isTerminal("processing")).toBe(false);
    expect(isTerminal("ready")).toBe(false);
  });
});
