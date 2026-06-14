import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";
import { db } from "../../lib/db";
import { sendStatusNotification, sendOrderReceivedNotifications } from "../../lib/notifications";

vi.mock("../../lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../lib/notifications", () => ({
  sendStatusNotification: vi.fn().mockResolvedValue(undefined),
  sendOrderReceivedNotifications: vi.fn().mockResolvedValue(undefined),
}));

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({});

const validInput = {
  customerName: "Jane Smith",
  customerEmail: "jane@example.com",
  customerPhone: "605-555-1234",
  fulfillmentType: "local_delivery" as const,
  address: "123 Main St, Rapid City, SD 57701",
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
  customerName: "Jane Smith",
  customerEmail: "jane@example.com",
  customerPhone: "605-555-1234",
  fulfillmentType: "local_delivery",
  address: "123 Main St, Rapid City, SD 57701",
  paymentMethod: "venmo",
  notes: "Please include extra napkins",
  status: "received",
  totalAmount: "39.00",
  paymentStatus: null,
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
          customerName: "Jane Smith",
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
    // Only return one product, missing product-2
    vi.mocked(db.product.findMany).mockResolvedValue([mockProducts[0]]);

    await expect(caller.orders.submit(validInput)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "One or more items are no longer available.",
    });

    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("fires sendOrderReceivedNotifications after successful submit", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.mocked(db.order.create).mockResolvedValue(mockOrder);

    await caller.orders.submit(validInput);

    // Allow the fire-and-forget promise to settle
    await Promise.resolve();

    expect(sendOrderReceivedNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-123" })
    );
  });

  it("does not call sendOrderReceivedNotifications when order creation fails", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);
    vi.mocked(db.order.create).mockRejectedValue(new Error("DB error"));

    await expect(caller.orders.submit(validInput)).rejects.toThrow();

    expect(sendOrderReceivedNotifications).not.toHaveBeenCalled();
  });
});

describe("orders.updateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid transition: received → confirmed updates status and triggers notification", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(mockOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...mockOrder, status: "confirmed" });

    const result = await caller.orders.updateStatus({ id: "order-123", status: "confirmed" });

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "order-123" },
      data: { status: "confirmed" },
      include: { orderItems: { include: { product: true } } },
    });
    expect(sendStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-123" }),
      "confirmed"
    );
    expect(result.status).toBe("confirmed");
  });

  it("valid transition: ready → delivered for local_delivery", async () => {
    const readyOrder = { ...mockOrder, status: "ready", fulfillmentType: "local_delivery" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(readyOrder);
    vi.mocked(db.order.update).mockResolvedValue({ ...readyOrder, status: "delivered" });

    await caller.orders.updateStatus({ id: "order-123", status: "delivered" });

    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "delivered" } })
    );
  });

  it("rejects skipping a state (received → ready)", async () => {
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(mockOrder);

    await expect(
      caller.orders.updateStatus({ id: "order-123", status: "ready" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
    expect(sendStatusNotification).not.toHaveBeenCalled();
  });

  it("rejects delivered for shipping fulfillment type", async () => {
    const readyShipping = { ...mockOrder, status: "ready", fulfillmentType: "shipping" };
    vi.mocked(db.order.findUniqueOrThrow).mockResolvedValue(readyShipping);

    await expect(
      caller.orders.updateStatus({ id: "order-123", status: "delivered" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.order.update).not.toHaveBeenCalled();
  });
});
