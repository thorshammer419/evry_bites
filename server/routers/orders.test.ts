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
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
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
