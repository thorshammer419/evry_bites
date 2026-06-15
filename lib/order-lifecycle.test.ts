import { describe, it, expect } from "vitest";
import { isValidTransition, nextStatuses, isTerminal } from "./order-lifecycle";
import type { FulfillmentType, OrderStatus } from "@prisma/client";

function order(status: OrderStatus, fulfillmentType: FulfillmentType = "local_delivery") {
  return { status, fulfillmentType };
}

describe("isValidTransition", () => {
  it("allows received → confirmed", () => {
    expect(isValidTransition(order("received"), "confirmed")).toBe(true);
  });

  it("allows confirmed → ready", () => {
    expect(isValidTransition(order("confirmed"), "ready")).toBe(true);
  });

  it("allows ready → delivered for local_delivery", () => {
    expect(isValidTransition(order("ready", "local_delivery"), "delivered")).toBe(true);
  });

  it("allows ready → shipped for shipping", () => {
    expect(isValidTransition(order("ready", "shipping"), "shipped")).toBe(true);
  });

  it("rejects ready → delivered for shipping", () => {
    expect(isValidTransition(order("ready", "shipping"), "delivered")).toBe(false);
  });

  it("rejects ready → shipped for local_delivery", () => {
    expect(isValidTransition(order("ready", "local_delivery"), "shipped")).toBe(false);
  });

  it("rejects skipping states (received → ready)", () => {
    expect(isValidTransition(order("received"), "ready")).toBe(false);
  });

  it("rejects going backwards (confirmed → received)", () => {
    expect(isValidTransition(order("confirmed"), "received")).toBe(false);
  });

  it("rejects transition from a terminal status", () => {
    expect(isValidTransition(order("delivered"), "confirmed")).toBe(false);
    expect(isValidTransition(order("shipped"), "confirmed")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("returns [confirmed] for received", () => {
    expect(nextStatuses(order("received"))).toEqual(["confirmed"]);
  });

  it("returns [ready] for confirmed", () => {
    expect(nextStatuses(order("confirmed"))).toEqual(["ready"]);
  });

  it("returns [delivered] for ready local_delivery", () => {
    expect(nextStatuses(order("ready", "local_delivery"))).toEqual(["delivered"]);
  });

  it("returns [shipped] for ready shipping", () => {
    expect(nextStatuses(order("ready", "shipping"))).toEqual(["shipped"]);
  });

  it("returns [] for terminal statuses", () => {
    expect(nextStatuses(order("delivered"))).toEqual([]);
    expect(nextStatuses(order("shipped"))).toEqual([]);
  });
});

describe("isTerminal", () => {
  it("returns true for delivered and shipped", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("shipped")).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    expect(isTerminal("received")).toBe(false);
    expect(isTerminal("confirmed")).toBe(false);
    expect(isTerminal("ready")).toBe(false);
  });
});
