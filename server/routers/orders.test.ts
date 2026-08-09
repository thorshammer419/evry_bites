import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";
import { db } from "../../lib/db";
import type { Notifier } from "../../lib/notifier";

vi.mock("../../lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customPaymentRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const createCaller = createCallerFactory(appRouter);

function makeCallerWithNotifier(notifier: Notifier) {
  return createCaller({ notifier });
}

const mockNotify = vi.fn().mockResolvedValue(undefined);
const caller = makeCallerWithNotifier({ notify: mockNotify });

const validInput = {
  firstName: "Jane",
  lastName: "Smith",
  customerEmail: "jane@example.com",
  customerPhone: "605-555-1234",
  fulfillmentType: "local_delivery" as const,
  addressLine1: "123 Main St",
  city: "Rapid City",
  state: "SD",
  zip: "57701",
  paymentMethod: "venmo" as const,
  notes: "Please include extra napkins",
  items: [
    { productId: "product-1", quantity: 2 },
    { productId: "product-2", quantity: 1 },
  ],
};

const mockProducts = [
  {
    id: "product-1",
    name: "Chocolate Chip Cookies",
    description: "Fresh baked cookies",
    price: "12.00" as never,
    batchSize: 12,
    unitLabel: "dozen",
    imageUrl: null,
    active: true,
    createdAt: new Date(),
  },
  {
    id: "product-2",
    name: "Brownies",
    description: "Fudgy brownies",
    price: "15.00" as never,
    batchSize: 9,
    unitLabel: "pan",
    imageUrl: null,
    active: true,
    createdAt: new Date(),
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOrder: any = {
  id: "order-123",
  firstName: "Jane",
  lastName: "Smith",
  customerEmail: "jane@example.com",
  customerPhone: "605-555-1234",
  fulfillmentType: "local_delivery",
  addressLine1: "123 Main St",
  city: "Rapid City",
  state: "SD",
  zip: "57701",
  paymentMethod: "venmo",
  notes: "Please include extra napkins",
  status: "received",
  totalAmount: "39.00",
  paypalOrderId: null,
  paypalCaptureId: null,
  createdAt: new Date(),
  orderItems: [
    {
      id: "item-1",
      orderId: "order-123",
      productId: "product-1",
      quantity: 2,
      unitPrice: "12.00",
      subtotal: "24.00",
      product: mockProducts[0],
    },
    {
      id: "item-2",
      orderId: "order-123",
      productId: "product-2",
      quantity: 1,
      unitPrice: "15.00",
      subtotal: "15.00",
      product: mockProducts[1],
    },
  ],
};

describe("orders.submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: creates order with correct totalAmount and orderItems", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.mocked(db.order.create).mockResolvedValue(mockOrder);

    const result = await caller.orders.submit(validInput);

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["product-1", "product-2"] } },
    });

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "Jane",
          lastName: "Smith",
          totalAmount: "39.00",
          orderItems: {
            create: expect.arrayContaining([
              expect.objectContaining({
                productId: "product-1",
                quantity: 2,
                unitPrice: "12.00",
                subtotal: "24.00",
              }),
              expect.objectContaining({
                productId: "product-2",
                quantity: 1,
                unitPrice: "15.00",
                subtotal: "15.00",
              }),
            ]),
          },
        }),
      })
    );

    expect(result).toEqual(mockOrder);
  });

  it("rejects order with inactive product", async () => {
    const productsWithInactive = [
      mockProducts[0],
      { ...mockProducts[1], active: false },
    ];
    vi.mocked(db.product.findMany).mockResolvedValue(productsWithInactive);

    await expect(caller.orders.submit(validInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "One or more items are no longer available.",
    });

    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("rejects order when a product ID is not found", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([mockProducts[0]]);

    await expect(caller.orders.submit(validInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "One or more items are no longer available.",
    });

    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("fires order.received notification after successful submit", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.mocked(db.order.create).mockResolvedValue(mockOrder);

    await caller.orders.submit(validInput);

    // Allow the fire-and-forget promise to settle
    await Promise.resolve();

    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.received",
      order: expect.objectContaining({ id: "order-123" }),
    });
  });

  it("does not fire notification when order creation fails", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.mocked(db.order.create).mockRejectedValue(new Error("DB error"));

    await expect(caller.orders.submit(validInput)).rejects.toThrow();

    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("orders.updateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid transition: received → processing updates status and triggers notification", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(mockOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "processing" });

    const result = await caller.orders.updateStatus({ id: "order-123", status: "processing" });

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "order-123" },
      data: { status: "processing" },
      include: { orderItems: { include: { product: true } } },
    });
    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.status_changed",
      order: expect.objectContaining({ id: "order-123" }),
      newStatus: "processing",
    });
    expect(result.status).toBe("processing");
  });

  it("valid transition: ready → shipped", async () => {
    const readyOrder = { ...mockOrder, status: "ready" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(readyOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...readyOrder, status: "shipped" });

    await caller.orders.updateStatus({ id: "order-123", status: "shipped" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "shipped" } })
    );
  });

  it("valid transition: shipped → delivered", async () => {
    const shippedOrder = { ...mockOrder, status: "shipped" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(shippedOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...shippedOrder, status: "delivered" });

    await caller.orders.updateStatus({ id: "order-123", status: "delivered" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "delivered" } })
    );
  });

  it("valid backward transition: shipped → ready", async () => {
    const shippedOrder = { ...mockOrder, status: "shipped" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(shippedOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...shippedOrder, status: "ready" });

    const result = await caller.orders.updateStatus({ id: "order-123", status: "ready" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ready" } })
    );
    expect(result.status).toBe("ready");
  });

  it("rejects skipping a state (received → ready)", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(mockOrder);

    await expect(
      caller.orders.updateStatus({ id: "order-123", status: "ready" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rejects ready → delivered (must go through shipped)", async () => {
    const readyOrder = { ...mockOrder, status: "ready" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(readyOrder);

    await expect(
      caller.orders.updateStatus({ id: "order-123", status: "delivered" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe("orders.requestRemainingBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cashOrder = {
    ...mockOrder,
    paymentMethod: "cash",
    status: "received",
    totalAmount: "39.00",
    cashCollected: "20.00",
    customPaymentRequests: [],
  };

  it("venmo channel: creates a tracked request and sends the Venmo deep link", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue(cashOrder);
    vi.mocked(db.customPaymentRequest.create).mockResolvedValue({
      id: "req-venmo-1",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "venmo",
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });

    const result = await caller.orders.requestRemainingBalance({
      orderId: "order-123",
      channel: "venmo",
      amount: 19,
    });

    expect(db.customPaymentRequest.create).toHaveBeenCalledWith({
      data: { orderId: "order-123", amount: 19, channel: "venmo" },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.custom_payment_requested",
        paymentType: "venmo",
        amount: 19,
      })
    );
    expect(result).toEqual({ requestId: "req-venmo-1" });
    // The order's recorded payment method is never touched by this mutation.
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("paypal channel: creates a tracked request and sends the payment-page link", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue(cashOrder);
    vi.mocked(db.customPaymentRequest.create).mockResolvedValue({
      id: "req-paypal-1",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });

    const result = await caller.orders.requestRemainingBalance({
      orderId: "order-123",
      channel: "paypal",
      amount: 19,
    });

    expect(db.customPaymentRequest.create).toHaveBeenCalledWith({
      data: { orderId: "order-123", amount: 19, channel: "paypal" },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.custom_payment_requested",
        paymentType: "paypal",
        paymentUrl: expect.stringContaining("req-paypal-1"),
      })
    );
    expect(result).toEqual({ requestId: "req-paypal-1" });
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("works on an order already delivered, as long as a balance remains", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({ ...cashOrder, status: "delivered" });
    vi.mocked(db.customPaymentRequest.create).mockResolvedValue({
      id: "req-3",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });

    await expect(
      caller.orders.requestRemainingBalance({ orderId: "order-123", channel: "paypal", amount: 19 })
    ).resolves.toEqual({ requestId: "req-3" });
  });

  it("rejects when the order has no remaining balance", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({ ...cashOrder, cashCollected: "39.00" });

    await expect(
      caller.orders.requestRemainingBalance({ orderId: "order-123", channel: "paypal", amount: 10 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.create).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rejects on a cancelled order", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({ ...cashOrder, status: "cancelled" });

    await expect(
      caller.orders.requestRemainingBalance({ orderId: "order-123", channel: "paypal", amount: 19 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.create).not.toHaveBeenCalled();
  });

  it("rejects on a refunded order", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({ ...cashOrder, status: "refunded" });

    await expect(
      caller.orders.requestRemainingBalance({ orderId: "order-123", channel: "venmo", amount: 19 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.create).not.toHaveBeenCalled();
  });
});

describe("orders.captureCustomPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({ purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] }) }
    ));
  });

  it("auto-advances once cash plus this capture cover the total (regression: balanceDue accounts for cash)", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue({
      id: "req-1",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: "PP-ORDER-1",
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({
      id: "req-1",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: "PP-ORDER-1",
      paypalCaptureId: "CAP-1",
      paid: true,
      createdAt: new Date(),
    });
    const fullyPaidOrder = {
      ...mockOrder,
      status: "pending_payment",
      totalAmount: "39.00",
      cashCollected: "20.00",
      customPaymentRequests: [{ amount: "19.00", paid: true }],
    };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(fullyPaidOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...fullyPaidOrder, status: "received" });

    const result = await caller.orders.captureCustomPayment({ requestId: "req-1", paypalOrderId: "PP-ORDER-1" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received" } })
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.payment_received" })
    );
    expect(result).toEqual({ success: true });
  });

  it("does not advance when cash plus paid requests still leave a balance", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue({
      id: "req-1",
      orderId: "order-123",
      amount: "10.00" as never,
      channel: "paypal",
      paypalOrderId: "PP-ORDER-1",
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({
      id: "req-1",
      orderId: "order-123",
      amount: "10.00" as never,
      channel: "paypal",
      paypalOrderId: "PP-ORDER-1",
      paypalCaptureId: "CAP-1",
      paid: true,
      createdAt: new Date(),
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({
      ...mockOrder,
      status: "pending_payment",
      totalAmount: "39.00",
      cashCollected: "20.00",
      customPaymentRequests: [{ amount: "10.00", paid: true }],
    });

    await caller.orders.captureCustomPayment({ requestId: "req-1", paypalOrderId: "PP-ORDER-1" });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.custom_payment_received" })
    );
  });

  it("rejects when the request is already paid", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue({
      id: "req-1",
      orderId: "order-123",
      amount: "10.00" as never,
      channel: "paypal",
      paypalOrderId: "PP-ORDER-1",
      paypalCaptureId: "CAP-0",
      paid: true,
      createdAt: new Date(),
    });

    await expect(
      caller.orders.captureCustomPayment({ requestId: "req-1", paypalOrderId: "PP-ORDER-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });
});

describe("orders.markCustomPaymentReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function pendingRequest(channel: "paypal" | "venmo", amount = "19.00", orderStatus: string = "pending_payment") {
    return {
      id: "req-1",
      orderId: "order-123",
      amount: amount as never,
      channel,
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
      order: { status: orderStatus },
    };
  }

  function balanceOrder(overrides: {
    status?: string;
    totalAmount?: string;
    cashCollected?: string | null;
    customPaymentRequests?: { amount: string; paid: boolean }[];
  } = {}) {
    return {
      ...mockOrder,
      status: overrides.status ?? "pending_payment",
      totalAmount: overrides.totalAmount ?? "39.00",
      cashCollected: overrides.cashCollected ?? null,
      customPaymentRequests: overrides.customPaymentRequests ?? [],
    };
  }

  it("marks a pending venmo request as paid without advancing when a balance remains", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("venmo"));
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({ ...pendingRequest("venmo"), paid: true });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      balanceOrder({ customPaymentRequests: [{ amount: "19.00", paid: true }] })
    );

    const result = await caller.orders.markCustomPaymentReceived({ requestId: "req-1" });

    expect(db.customPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { paid: true },
    });
    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.custom_payment_received",
      order: expect.objectContaining({ id: "order-123" }),
      amount: 19,
    });
    expect(result).toEqual({ success: true });
  });

  it("marks a pending paypal request as paid without advancing when a balance remains", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("paypal"));
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({ ...pendingRequest("paypal"), paid: true });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      balanceOrder({ customPaymentRequests: [{ amount: "19.00", paid: true }] })
    );

    await caller.orders.markCustomPaymentReceived({ requestId: "req-1" });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.custom_payment_received" })
    );
  });

  it("auto-advances pending_payment to received once the balance is fully covered", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("venmo", "39.00"));
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({ ...pendingRequest("venmo", "39.00"), paid: true });
    const fullyPaidOrder = balanceOrder({ customPaymentRequests: [{ amount: "39.00", paid: true }] });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(fullyPaidOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...fullyPaidOrder, status: "received" });

    await caller.orders.markCustomPaymentReceived({ requestId: "req-1" });

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "order-123" },
      data: { status: "received" },
      include: expect.anything(),
    });
    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.payment_received",
      order: expect.objectContaining({ status: "received" }),
    });
  });

  it("does not auto-advance when the order isn't in pending_payment, even if fully covered", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("venmo", "39.00", "received"));
    vi.mocked(db.customPaymentRequest.update).mockResolvedValue({ ...pendingRequest("venmo", "39.00"), paid: true });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      balanceOrder({ status: "received", customPaymentRequests: [{ amount: "39.00", paid: true }] })
    );

    await caller.orders.markCustomPaymentReceived({ requestId: "req-1" });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.custom_payment_received" })
    );
  });

  it("rejects when the request is already paid", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue({ ...pendingRequest("venmo"), paid: true });

    await expect(
      caller.orders.markCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects when the order is cancelled", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("venmo", "19.00", "cancelled"));

    await expect(
      caller.orders.markCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects when the order is refunded", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(pendingRequest("paypal", "19.00", "refunded"));

    await expect(
      caller.orders.markCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects when the request doesn't exist", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(null);

    await expect(
      caller.orders.markCustomPaymentReceived({ requestId: "missing" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
