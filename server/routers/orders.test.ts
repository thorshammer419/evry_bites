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
      delete: vi.fn(),
    },
    customPaymentRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tender: {
      create: vi.fn(),
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
          receivedAt: expect.any(Date),
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

  it("valid transition: pending_payment → received sets receivedAt", async () => {
    const pendingOrder = { ...mockOrder, status: "pending_payment" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(pendingOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...pendingOrder, status: "received" });

    await caller.orders.updateStatus({ id: "order-123", status: "received" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
    );
  });

  it("does not overwrite an already-set receivedAt on a backward processing → received correction", async () => {
    const originalReceivedAt = new Date("2026-01-01T00:00:00Z");
    const processingOrder = { ...mockOrder, status: "processing", receivedAt: originalReceivedAt };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(processingOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...processingOrder, status: "received" });

    await caller.orders.updateStatus({ id: "order-123", status: "received" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received" } })
    );
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

describe("orders.adminSetStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets receivedAt when overriding status to received", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ ...mockOrder, receivedAt: null });
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "received" });

    await caller.orders.adminSetStatus({ id: "order-123", status: "received" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "received", receivedAt: expect.any(Date) }) })
    );
  });

  it("sets refundedAt when overriding status to refunded", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ ...mockOrder, refundedAt: null });
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "refunded" });

    await caller.orders.adminSetStatus({ id: "order-123", status: "refunded" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "refunded", refundedAt: expect.any(Date) }) })
    );
  });

  it("does not set receivedAt or refundedAt for an unrelated status override", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(mockOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "processing" });

    await caller.orders.adminSetStatus({ id: "order-123", status: "processing" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "processing" } })
    );
  });

  it("does not overwrite an already-set receivedAt when re-overridden to received", async () => {
    const originalReceivedAt = new Date("2026-01-01T00:00:00Z");
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ ...mockOrder, receivedAt: originalReceivedAt });
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "received" });

    await caller.orders.adminSetStatus({ id: "order-123", status: "received" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received" } })
    );
  });

  it("does not overwrite an already-set refundedAt when re-overridden to refunded", async () => {
    const originalRefundedAt = new Date("2026-01-01T00:00:00Z");
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ ...mockOrder, status: "refunded", refundedAt: originalRefundedAt });
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "refunded" });

    await caller.orders.adminSetStatus({ id: "order-123", status: "refunded" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunded", cashCollected: null } })
    );
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

  it("sends to the order's registered email by default", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue(cashOrder);
    vi.mocked(db.customPaymentRequest.create).mockResolvedValue({
      id: "req-default-email",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });

    await caller.orders.requestRemainingBalance({ orderId: "order-123", channel: "paypal", amount: 19 });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ order: expect.objectContaining({ customerEmail: "jane@example.com" }) })
    );
  });

  it("sends to an override email when provided, without touching the order record", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue(cashOrder);
    vi.mocked(db.customPaymentRequest.create).mockResolvedValue({
      id: "req-override-email",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: "paypal",
      paypalOrderId: null,
      paypalCaptureId: null,
      paid: false,
      createdAt: new Date(),
    });

    await caller.orders.requestRemainingBalance({
      orderId: "order-123",
      channel: "paypal",
      amount: 19,
      email: "different@example.com",
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ order: expect.objectContaining({ customerEmail: "different@example.com" }) })
    );
    // The order's actual registered email is never touched.
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("rejects a malformed override email before ever reaching the handler", async () => {
    await expect(
      caller.orders.requestRemainingBalance({
        orderId: "order-123",
        channel: "paypal",
        amount: 19,
        email: "not-an-email",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.create).not.toHaveBeenCalled();
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
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
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
      data: { status: "received", receivedAt: expect.any(Date) },
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

describe("orders.changePaymentMethod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({}) }
    ));
  });

  function orderWith(overrides: Partial<typeof mockOrder> & { customPaymentRequests?: { paid: boolean }[] }) {
    return {
      ...mockOrder,
      cashCollected: null,
      customPaymentRequests: [],
      paypalCaptureId: null,
      ...overrides,
    };
  }

  it("rejects when cash has been collected", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      orderWith({ paymentMethod: "cash", status: "received", cashCollected: "20.00" })
    );

    await expect(
      caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "venmo" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("rejects when a custom payment request has been paid", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      orderWith({
        paymentMethod: "cash",
        status: "received",
        customPaymentRequests: [{ paid: true, amount: "10.00" }],
      })
    );

    await expect(
      caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "venmo" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("allows switching when nothing has been collected (unchanged allowed path)", async () => {
    const existing = orderWith({ paymentMethod: "cash", status: "received" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, paymentMethod: "venmo", status: "pending_payment" });

    await caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "venmo" });

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "order-123" },
      data: {
        paymentMethod: "venmo",
        status: "pending_payment",
        paypalCaptureId: null,
        paypalInvoiceId: null,
        paypalOrderId: null,
      },
      include: expect.anything(),
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.venmo_payment_requested" })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the venmo payment request to an override email when provided", async () => {
    const existing = orderWith({ paymentMethod: "cash", status: "received" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, paymentMethod: "venmo", status: "pending_payment" });

    await caller.orders.changePaymentMethod({
      id: "order-123",
      newPaymentMethod: "venmo",
      email: "different@example.com",
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.venmo_payment_requested",
        order: expect.objectContaining({ customerEmail: "different@example.com" }),
      })
    );
    // The override never leaks into what actually gets persisted.
    const updateCall = vi.mocked(db.order.update).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("customerEmail");
  });

  it("sends the paypal payment request to an override email when provided", async () => {
    const existing = orderWith({ paymentMethod: "cash", status: "received" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, paymentMethod: "paypal", status: "pending_payment" });

    await caller.orders.changePaymentMethod({
      id: "order-123",
      newPaymentMethod: "paypal",
      email: "different@example.com",
    });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.paypal_payment_requested",
        order: expect.objectContaining({ customerEmail: "different@example.com" }),
      })
    );
    const updateCall = vi.mocked(db.order.update).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("customerEmail");
  });

  it("rejects a malformed override email before ever reaching the handler", async () => {
    await expect(
      caller.orders.changePaymentMethod({
        id: "order-123",
        newPaymentMethod: "venmo",
        email: "not-an-email",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("refunds the paypal capture before switching away from a paid PayPal checkout", async () => {
    const existing = orderWith({ paymentMethod: "paypal", status: "pending_payment", paypalCaptureId: "CAP-1" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, paymentMethod: "cash", status: "pending_payment" });

    await caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "cash" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/payments/captures/CAP-1/refund"),
      expect.anything()
    );
  });

  it("refunds the paypal capture even when the order is recorded as venmo (PayPal-detected-as-Venmo checkout)", async () => {
    // A checkout captured through the PayPal API can be detected as a Venmo
    // payment (payment_source.venmo) and recorded with paymentMethod "venmo"
    // while still holding a real PayPal capture — that capture must still be
    // refunded before switching away, regardless of the recorded label.
    const existing = orderWith({ paymentMethod: "venmo", status: "pending_payment", paypalCaptureId: "CAP-2" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, paymentMethod: "cash", status: "pending_payment" });

    await caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "cash" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/payments/captures/CAP-2/refund"),
      expect.anything()
    );
  });

  it("rejects on a delivered order", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      orderWith({ paymentMethod: "cash", status: "delivered" })
    );

    await expect(
      caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "venmo" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects on a refunded order", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(
      orderWith({ paymentMethod: "cash", status: "refunded" })
    );

    await expect(
      caller.orders.changePaymentMethod({ id: "order-123", newPaymentMethod: "venmo" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe("orders.cancelOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({}) }
    ));
  });

  function cancelableOrder(overrides: Partial<typeof mockOrder> & {
    customPaymentRequests?: { id: string; amount: string; channel: "paypal" | "venmo"; paypalCaptureId: string | null; paid: boolean }[];
    tenders?: { id: string; method: "cash" | "paypal" | "venmo"; amount: string; paypalCaptureId: string | null }[];
  }) {
    return {
      ...mockOrder,
      status: "received",
      totalAmount: "60.00",
      cashCollected: null,
      paypalCaptureId: null,
      customPaymentRequests: [],
      tenders: [],
      ...overrides,
    };
  }

  it("splits a mix of paid PayPal, paid Venmo, and cash into autoRefunded vs manualReturn", async () => {
    const existing = cancelableOrder({
      cashCollected: "20.00",
      customPaymentRequests: [
        { id: "cp-paypal", amount: "15.00", channel: "paypal", paypalCaptureId: "CAP-CP-1", paid: true },
        { id: "cp-venmo", amount: "10.00", channel: "venmo", paypalCaptureId: null, paid: true },
        { id: "cp-pending", amount: "5.00", channel: "paypal", paypalCaptureId: null, paid: false },
      ],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled", cashCollected: null });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([{ channel: "paypal", amount: 15 }]);
    expect(result.manualReturn).toEqual(
      expect.arrayContaining([
        { channel: "venmo", amount: 10, detail: expect.any(String) },
        { channel: "cash", amount: 20 },
      ])
    );
    expect(result.manualReturn).toHaveLength(2);
    expect(result.isRefund).toBe(false);
  });

  it("splits a POS split-tender sale (captured PayPal tender + cash tender) into autoRefunded vs manualReturn", async () => {
    const existing = cancelableOrder({
      fulfillmentType: "pickup",
      tenders: [
        { id: "tender-paypal", method: "paypal", amount: "18.00", paypalCaptureId: "CAP-TENDER-1" },
        { id: "tender-cash", method: "cash", amount: "12.00", paypalCaptureId: null },
      ],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([{ channel: "paypal", amount: 18 }]);
    expect(result.manualReturn).toEqual([{ channel: "cash", amount: 12 }]);
  });

  it("lists two separate cash tenders as two separate manualReturn entries, not merged", async () => {
    const existing = cancelableOrder({
      fulfillmentType: "pickup",
      tenders: [
        { id: "tender-1", method: "cash", amount: "10.00", paypalCaptureId: null },
        { id: "tender-2", method: "cash", amount: "10.00", paypalCaptureId: null },
      ],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.manualReturn).toEqual([
      { channel: "cash", amount: 10 },
      { channel: "cash", amount: 10 },
    ]);
  });

  it("moves a failed-to-refund PayPal tender to manualReturn", async () => {
    vi.mocked(fetch).mockImplementation(async (url: unknown) => {
      const s = String(url);
      if (s.includes("/oauth2/token")) return { ok: true, json: async () => ({ access_token: "test-token" }) } as never;
      if (s.includes("/CAP-TENDER-FAIL/refund")) return { ok: false, text: async () => "capture already refunded" } as never;
      return { ok: true, json: async () => ({}) } as never;
    });
    const existing = cancelableOrder({
      fulfillmentType: "pickup",
      tenders: [{ id: "tender-fail", method: "paypal", amount: "22.00", paypalCaptureId: "CAP-TENDER-FAIL" }],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([]);
    expect(result.manualReturn).toEqual([{ channel: "paypal", amount: 22 }]);
  });

  it("reflects both legacy cashCollected and Tenders when an order somehow carries both", async () => {
    const existing = cancelableOrder({
      cashCollected: "5.00",
      tenders: [{ id: "tender-1", method: "cash", amount: "7.00", paypalCaptureId: null }],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled", cashCollected: null });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.manualReturn).toEqual([
      { channel: "cash", amount: 5 },
      { channel: "cash", amount: 7 },
    ]);
  });

  it("moves a custom PayPal payment to manualReturn when its refund attempt fails, instead of reporting it as auto-refunded", async () => {
    vi.mocked(fetch).mockImplementation(async (url: unknown) => {
      const s = String(url);
      if (s.includes("/oauth2/token")) return { ok: true, json: async () => ({ access_token: "test-token" }) } as never;
      if (s.includes("/CAP-FAIL/refund")) return { ok: false, text: async () => "capture already refunded" } as never;
      return { ok: true, json: async () => ({}) } as never;
    });
    const existing = cancelableOrder({
      customPaymentRequests: [
        { id: "cp-fail", amount: "12.00", channel: "paypal", paypalCaptureId: "CAP-FAIL", paid: true },
      ],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([]);
    expect(result.manualReturn).toEqual([{ channel: "paypal", amount: 12 }]);
  });

  it("auto-refunds the main PayPal checkout capture", async () => {
    const existing = cancelableOrder({ paypalCaptureId: "CAP-MAIN" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/payments/captures/CAP-MAIN/refund"),
      expect.anything()
    );
    expect(result.autoRefunded).toEqual([{ channel: "paypal", amount: 60 }]);
    expect(result.manualReturn).toEqual([]);
  });

  it("lists cash alone in manualReturn when that's all that was collected", async () => {
    const existing = cancelableOrder({ cashCollected: "25.00" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([]);
    expect(result.manualReturn).toEqual([{ channel: "cash", amount: 25 }]);
  });

  it("returns empty summaries when nothing was ever collected", async () => {
    const existing = cancelableOrder({});
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(result.autoRefunded).toEqual([]);
    expect(result.manualReturn).toEqual([]);
  });

  it("still resets cashCollected and un-pays all custom payment requests", async () => {
    const existing = cancelableOrder({
      cashCollected: "20.00",
      customPaymentRequests: [{ id: "cp-venmo", amount: "10.00", channel: "venmo", paypalCaptureId: null, paid: true }],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled", cashCollected: null });

    await caller.orders.cancelOrder({ id: "order-123" });

    expect(db.customPaymentRequest.updateMany).toHaveBeenCalledWith({
      where: { orderId: "order-123" },
      data: { paid: false },
    });
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled", cashCollected: null } })
    );
  });

  it("marks a ready/shipped/delivered order as refunded rather than cancelled", async () => {
    const existing = cancelableOrder({ status: "shipped", paypalCaptureId: "CAP-MAIN" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "refunded" });

    const result = await caller.orders.cancelOrder({ id: "order-123" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refunded", cashCollected: null, refundedAt: expect.any(Date) } })
    );
    expect(result.isRefund).toBe(true);
  });

  it("does not set refundedAt when the outcome is a cancellation, not a refund", async () => {
    const existing = cancelableOrder({ status: "received" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "cancelled" });

    await caller.orders.cancelOrder({ id: "order-123" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled", cashCollected: null } })
    );
  });
});

describe("orders.posCreateOrderCashTender", () => {
  const posItems = [
    { productId: "product-1", quantity: 2 },
    { productId: "product-2", quantity: 1 },
  ]; // matches mockProducts: $12*2 + $15*1 = $39.00

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
  });

  it("a full-amount tender creates the order as received and notifies", async () => {
    const created = {
      ...mockOrder, fulfillmentType: "pickup", paymentMethod: "cash", status: "pending_payment",
      totalAmount: "39.00", tenders: [{ id: "t-1", method: "cash", amount: "39.00" }],
    };
    vi.mocked(db.order.create).mockResolvedValue(created);
    vi.mocked(db.order.update).mockResolvedValue({ ...created, status: "received" });

    const result = await caller.orders.posCreateOrderCashTender({ items: posItems, amount: 39 });

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fulfillmentType: "pickup",
          paymentMethod: "cash",
          status: "pending_payment",
          totalAmount: "39.00",
          tenders: { create: [{ method: "cash", amount: "39.00" }] },
        }),
      })
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
    );
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ type: "order.received" }));
    expect(result.status).toBe("received");
  });

  it("a partial tender leaves the order pending_payment without notifying", async () => {
    const created = {
      ...mockOrder, fulfillmentType: "pickup", paymentMethod: "cash", status: "pending_payment",
      totalAmount: "39.00", tenders: [{ id: "t-1", method: "cash", amount: "20.00" }],
    };
    vi.mocked(db.order.create).mockResolvedValue(created);

    const result = await caller.orders.posCreateOrderCashTender({ items: posItems, amount: 20 });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_payment");
  });

  it("rejects an amount greater than the order total, without creating the order", async () => {
    await expect(
      caller.orders.posCreateOrderCashTender({ items: posItems, amount: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe("orders.posAddCashTender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function pendingPosOrder(overrides: Partial<typeof mockOrder> = {}) {
    return {
      ...mockOrder,
      fulfillmentType: "pickup",
      status: "pending_payment",
      totalAmount: "39.00",
      cashCollected: null,
      customPaymentRequests: [],
      tenders: [{ id: "t-1", method: "cash", amount: "20.00" }],
      ...overrides,
    };
  }

  it("a tender that exactly covers the remaining balance flips status to received and notifies", async () => {
    const existing = pendingPosOrder();
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, status: "received" });

    const result = await caller.orders.posAddCashTender({ orderId: "order-123", amount: 19 });

    expect(db.tender.create).toHaveBeenCalledWith({
      data: { orderId: "order-123", method: "cash", amount: "19.00" },
    });
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
    );
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ type: "order.received" }));
    expect(result.status).toBe("received");
  });

  it("a tender smaller than the remaining balance stays pending_payment without notifying", async () => {
    const existing = pendingPosOrder();
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);

    const result = await caller.orders.posAddCashTender({ orderId: "order-123", amount: 5 });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result.status).toBe("pending_payment");
  });

  it("rejects an amount greater than the remaining balance", async () => {
    const existing = pendingPosOrder();
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);

    await expect(
      caller.orders.posAddCashTender({ orderId: "order-123", amount: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.tender.create).not.toHaveBeenCalled();
  });

  it("rejects when the order is not an in-progress POS sale", async () => {
    const existing = pendingPosOrder({ status: "received" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);

    await expect(
      caller.orders.posAddCashTender({ orderId: "order-123", amount: 5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("orders.posCaptureTender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({ purchase_units: [{ payments: { captures: [{ id: "CAP-TENDER-1" }] } }] }) }
    ));
  });

  it("first capture on a fresh order decrements stock and sets paymentMethod from the detected method", async () => {
    const fresh = {
      ...mockOrder, fulfillmentType: "pickup", status: "pending_payment", totalAmount: "39.00",
      cashCollected: null, customPaymentRequests: [], tenders: [],
    };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(fresh);
    vi.mocked(db.order.update).mockResolvedValue({ ...fresh, status: "received", paymentMethod: "paypal" });

    const result = await caller.orders.posCaptureTender({ orderId: "order-123", paypalOrderId: "PP-1", amount: 39 });

    expect(db.tender.create).toHaveBeenCalledWith({
      data: {
        orderId: "order-123", method: "paypal", amount: "39.00",
        paypalOrderId: "PP-1", paypalCaptureId: "CAP-TENDER-1",
      },
    });
    expect(db.product.updateMany).toHaveBeenCalled();
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentMethod: "paypal" } })
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
    );
    expect(result.status).toBe("received");
  });

  it("second capture on an order that already has a tender does not decrement stock or overwrite paymentMethod", async () => {
    const midSale = {
      ...mockOrder, fulfillmentType: "pickup", paymentMethod: "cash", status: "pending_payment", totalAmount: "39.00",
      cashCollected: null, customPaymentRequests: [], tenders: [{ amount: "20.00" }],
    };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(midSale);
    vi.mocked(db.order.update).mockResolvedValue({ ...midSale, status: "received" });

    const result = await caller.orders.posCaptureTender({ orderId: "order-123", paypalOrderId: "PP-2", amount: 19 });

    expect(db.product.updateMany).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentMethod: expect.anything() } })
    );
    expect(result.status).toBe("received");
  });

  it("detects venmo from payment_source and records the tender as venmo", async () => {
    vi.mocked(fetch).mockImplementation(async (url: unknown) => {
      const s = String(url);
      if (s.includes("/oauth2/token")) return { ok: true, json: async () => ({ access_token: "test-token" }) } as never;
      return {
        ok: true,
        json: async () => ({ payment_source: { venmo: {} }, purchase_units: [{ payments: { captures: [{ id: "CAP-VENMO" }] } }] }),
      } as never;
    });
    const fresh = {
      ...mockOrder, fulfillmentType: "pickup", status: "pending_payment", totalAmount: "39.00",
      cashCollected: null, customPaymentRequests: [], tenders: [],
    };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(fresh);
    vi.mocked(db.order.update).mockResolvedValue({ ...fresh, paymentMethod: "venmo" });

    await caller.orders.posCaptureTender({ orderId: "order-123", paypalOrderId: "PP-3", amount: 10 });

    expect(db.tender.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: "venmo", paypalCaptureId: "CAP-VENMO" }) })
    );
  });
});

describe("orders.capturePaypalOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({ purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] }) }
    ));
  });

  it("sets receivedAt when capturing the online-store checkout", async () => {
    vi.mocked(db.order.update).mockResolvedValue(mockOrder);

    await caller.orders.capturePaypalOrder({ orderId: "order-123", paypalOrderId: "PP-1" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "received", receivedAt: expect.any(Date) }) })
    );
  });
});

describe("orders.capturePaypalWithPayerInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : {
            ok: true,
            json: async () => ({
              payer: { name: { given_name: "Jane", surname: "Smith" }, email_address: "jane@example.com" },
              purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }],
            }),
          }
    ));
  });

  it("sets receivedAt when creating an order from a captured payer-info checkout", async () => {
    vi.mocked(db.order.create).mockResolvedValue(mockOrder);

    await caller.orders.capturePaypalWithPayerInfo({
      paypalOrderId: "PP-1",
      fulfillmentType: "shipping",
      addressLine1: "123 Main St",
      city: "Rapid City",
      state: "SD",
      zip: "57701",
      items: [{ productId: "product-1", quantity: 1 }],
    });

    expect(db.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "received", receivedAt: expect.any(Date) }) })
    );
  });
});

describe("orders.capturePaypalPaymentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/oauth2/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, json: async () => ({ purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] }) }
    ));
  });

  it("sets receivedAt when capturing an existing order's payment link", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue({ ...mockOrder, status: "pending_payment" });
    vi.mocked(db.order.update).mockResolvedValue(mockOrder);

    await caller.orders.capturePaypalPaymentLink({ orderId: "order-123", paypalOrderId: "PP-1" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "received", receivedAt: expect.any(Date) }) })
    );
  });
});

describe("orders.unmarkCustomPaymentReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function paidRequest(overrides: {
    channel?: "paypal" | "venmo";
    paypalCaptureId?: string | null;
    orderStatus?: string;
  } = {}) {
    return {
      id: "req-1",
      orderId: "order-123",
      amount: "19.00" as never,
      channel: overrides.channel ?? "venmo",
      paypalOrderId: null,
      paypalCaptureId: overrides.paypalCaptureId ?? null,
      paid: true,
      createdAt: new Date(),
      order: { ...mockOrder, status: overrides.orderStatus ?? "received" },
    };
  }

  it("unmarks a manually-marked Venmo payment", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(paidRequest({ channel: "venmo" }));

    const result = await caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" });

    expect(db.customPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { paid: false },
    });
    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.custom_payment_unmarked",
      order: expect.objectContaining({ id: "order-123" }),
      amount: 19,
    });
    expect(result).toEqual({ success: true });
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("unmarks a manually-marked PayPal payment (force-marked without a real capture)", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(
      paidRequest({ channel: "paypal", paypalCaptureId: null })
    );

    await caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" });

    expect(db.customPaymentRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { paid: false },
    });
  });

  it("rejects a PayPal payment that was actually captured via the API", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(
      paidRequest({ channel: "paypal", paypalCaptureId: "CAP-1" })
    );

    await expect(
      caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects when the request isn't paid", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue({
      ...paidRequest(),
      paid: false,
    });

    await expect(
      caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects on a cancelled order", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(
      paidRequest({ orderStatus: "cancelled" })
    );

    await expect(
      caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.customPaymentRequest.update).not.toHaveBeenCalled();
  });

  it("rejects on a refunded order", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(
      paidRequest({ orderStatus: "refunded" })
    );

    await expect(
      caller.orders.unmarkCustomPaymentReceived({ requestId: "req-1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when the request doesn't exist", async () => {
    vi.mocked(db.customPaymentRequest.findUnique).mockResolvedValue(null);

    await expect(
      caller.orders.unmarkCustomPaymentReceived({ requestId: "missing" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("orders.logCashCollected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function pendingCashOrder(overrides: Partial<typeof mockOrder> & {
    customPaymentRequests?: { amount: string; paid: boolean }[];
  } = {}) {
    return {
      ...mockOrder,
      paymentMethod: "cash",
      status: "pending_payment",
      totalAmount: "39.00",
      cashCollected: null,
      customPaymentRequests: [],
      ...overrides,
    };
  }

  it("does not auto-advance when the logged amount alone doesn't cover the total", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(pendingCashOrder());
    vi.mocked(db.order.update).mockResolvedValue({ ...pendingCashOrder(), cashCollected: "10.00" });

    await caller.orders.logCashCollected({ id: "order-123", amount: "10.00" });

    expect(db.order.update).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ type: "order.received" }));
  });

  it("auto-advances when the logged amount alone covers the total", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(pendingCashOrder());
    vi.mocked(db.order.update).mockResolvedValue({ ...pendingCashOrder(), cashCollected: "39.00", status: "received" });

    await caller.orders.logCashCollected({ id: "order-123", amount: "39.00" });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.received" })
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "received", receivedAt: expect.any(Date) } })
    );
  });

  it("auto-advances when cash plus an already-paid custom payment request together cover the total (regression: balanceDue accounts for both)", async () => {
    const existing = pendingCashOrder({
      customPaymentRequests: [{ amount: "20.00", paid: true }],
    });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, cashCollected: "19.00", status: "received" });

    await caller.orders.logCashCollected({ id: "order-123", amount: "19.00" });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.received" })
    );
  });

  it("does not auto-advance when the order isn't pending_payment", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(pendingCashOrder({ status: "received" }));
    vi.mocked(db.order.update).mockResolvedValue({ ...pendingCashOrder(), cashCollected: "39.00", status: "received" });

    await caller.orders.logCashCollected({ id: "order-123", amount: "39.00" });

    expect(db.order.update).toHaveBeenCalledTimes(1);
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ type: "order.received" }));
  });
});

describe("orders.clearCashCollected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function orderWithCash(overrides: Partial<typeof mockOrder> = {}) {
    return {
      ...mockOrder,
      paymentMethod: "cash",
      status: "received",
      cashCollected: "20.00",
      ...overrides,
    };
  }

  it("clears a logged cash amount back to null", async () => {
    const existing = orderWithCash();
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, cashCollected: null });

    const result = await caller.orders.clearCashCollected({ id: "order-123" });

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "order-123" },
      data: { cashCollected: null },
      include: expect.anything(),
    });
    expect(mockNotify).toHaveBeenCalledWith({
      type: "order.cash_collected_cleared",
      order: expect.objectContaining({ id: "order-123" }),
      amount: 20,
    });
    expect(result.cashCollected).toBeNull();
  });

  it("is available even if the payment method has since changed away from cash", async () => {
    const existing = orderWithCash({ paymentMethod: "venmo" });
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(existing);
    vi.mocked(db.order.update).mockResolvedValue({ ...existing, cashCollected: null });

    await expect(caller.orders.clearCashCollected({ id: "order-123" })).resolves.toBeDefined();
    expect(db.order.update).toHaveBeenCalled();
  });

  it("rejects when there's nothing to clear", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(orderWithCash({ cashCollected: null }));

    await expect(
      caller.orders.clearCashCollected({ id: "order-123" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("rejects on a cancelled order", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(orderWithCash({ status: "cancelled" }));

    await expect(
      caller.orders.clearCashCollected({ id: "order-123" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("rejects on a refunded order", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(orderWithCash({ status: "refunded" }));

    await expect(
      caller.orders.clearCashCollected({ id: "order-123" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
