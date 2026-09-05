import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";
import { db } from "../../lib/db";

vi.mock("../../lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productCostRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { NullNotifier } from "../../lib/null-notifier";

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({ notifier: new NullNotifier() });

const mockProduct = {
  id: "1",
  name: "Cookies",
  description: "Fresh cookies",
  price: "12.00" as never,
  batchSize: 12,
  unitLabel: "dozen",
  imageUrl: null,
  posVisible: true,
  storefrontVisible: true,
  createdAt: new Date(),
};

describe("products.listPosVisible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only POS-visible products ordered by name", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);

    await caller.products.listPosVisible();

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { posVisible: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns the products from the database", async () => {
    const products = [
      { ...mockProduct, id: "1", name: "Brownies" },
      { ...mockProduct, id: "2", name: "Cookies" },
    ];
    vi.mocked(db.product.findMany).mockResolvedValue(products);

    const result = await caller.products.listPosVisible();

    expect(result).toEqual(products);
  });
});

describe("products.listStorefrontVisible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only storefront-visible products ordered by name", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);

    await caller.products.listStorefrontVisible();

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { storefrontVisible: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns the products from the database", async () => {
    const products = [
      { ...mockProduct, id: "1", name: "Brownies" },
      { ...mockProduct, id: "2", name: "Cookies" },
    ];
    vi.mocked(db.product.findMany).mockResolvedValue(products);

    const result = await caller.products.listStorefrontVisible();

    expect(result).toEqual(products);
  });
});

describe("products.listAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries all products ordered by name (no visibility filter)", async () => {
    const products = [
      { ...mockProduct, id: "1", name: "Brownies", posVisible: false, storefrontVisible: false },
      { ...mockProduct, id: "2", name: "Cookies" },
    ];
    vi.mocked(db.product.findMany).mockResolvedValue(products);

    const result = await caller.products.listAll();

    expect(db.product.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
    });
    expect(result).toEqual(products);
  });
});

describe("products.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.product.create with correct fields", async () => {
    vi.mocked(db.product.create).mockResolvedValue(mockProduct);

    const input = {
      name: "Cookies",
      description: "Fresh cookies",
      price: "12.00",
      batchSize: 12,
      unitLabel: "dozen",
      imageUrl: undefined,
      posVisible: true,
      storefrontVisible: true,
    };

    await caller.products.create(input);

    expect(db.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Cookies",
        description: "Fresh cookies",
        price: "12.00",
        batchSize: 12,
        unitLabel: "dozen",
        imageUrl: null,
        posVisible: true,
        storefrontVisible: true,
      }),
    });
  });

  it("defaults both visibility flags to true when omitted", async () => {
    vi.mocked(db.product.create).mockResolvedValue(mockProduct);

    await caller.products.create({
      name: "Cookies",
      description: "Fresh cookies",
      price: "12.00",
      batchSize: 12,
      unitLabel: "dozen",
    });

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ posVisible: true, storefrontVisible: true }),
      })
    );
  });

  it("saves imageUrl as null when empty string is provided", async () => {
    vi.mocked(db.product.create).mockResolvedValue(mockProduct);

    await caller.products.create({
      name: "Cookies",
      description: "Fresh cookies",
      price: "12.00",
      batchSize: 12,
      unitLabel: "dozen",
      imageUrl: "",
    });

    expect(db.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: null }),
      })
    );
  });
});

describe("products.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.product.update with correct id and data", async () => {
    vi.mocked(db.product.update).mockResolvedValue({
      ...mockProduct,
      name: "Updated Cookies",
    });

    await caller.products.update({
      id: "1",
      name: "Updated Cookies",
      description: "Even fresher cookies",
      price: "14.00",
      batchSize: 12,
      unitLabel: "dozen",
      imageUrl: undefined,
      posVisible: true,
      storefrontVisible: false,
    });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: expect.objectContaining({
        name: "Updated Cookies",
        description: "Even fresher cookies",
        price: "14.00",
        batchSize: 12,
        unitLabel: "dozen",
        imageUrl: null,
        posVisible: true,
        storefrontVisible: false,
      }),
    });
  });
});

describe("products.toggleVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("decommissions (hides both flags) a product visible on at least one channel", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({
      ...mockProduct,
      posVisible: true,
      storefrontVisible: false,
    });
    vi.mocked(db.product.update).mockResolvedValue({
      ...mockProduct,
      posVisible: false,
      storefrontVisible: false,
    });

    const result = await caller.products.toggleVisibility({ id: "1" });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { posVisible: false, storefrontVisible: false },
    });
    expect(result.posVisible).toBe(false);
    expect(result.storefrontVisible).toBe(false);
  });

  it("reactivates (shows both flags) a product hidden on both channels", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({
      ...mockProduct,
      posVisible: false,
      storefrontVisible: false,
    });
    vi.mocked(db.product.update).mockResolvedValue({
      ...mockProduct,
      posVisible: true,
      storefrontVisible: true,
    });

    const result = await caller.products.toggleVisibility({ id: "1" });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { posVisible: true, storefrontVisible: true },
    });
    expect(result.posVisible).toBe(true);
    expect(result.storefrontVisible).toBe(true);
  });
});

const mockCostRecord = {
  id: "cost-1",
  productId: "1",
  costPerBatch: "8.50" as never,
  effectiveFrom: new Date("2026-09-01T00:00:00Z"),
  createdAt: new Date(),
};

describe("products.addCostRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a cost record with the product id, cost, and effective-from date", async () => {
    vi.mocked(db.productCostRecord.create).mockResolvedValue(mockCostRecord);

    await caller.products.addCostRecord({
      productId: "1",
      costPerBatch: "8.50",
      effectiveFrom: "2026-09-01",
    });

    expect(db.productCostRecord.create).toHaveBeenCalledWith({
      data: {
        productId: "1",
        costPerBatch: "8.50",
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
  });
});

describe("products.listCostHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists a product's cost records, most recently effective first", async () => {
    vi.mocked(db.productCostRecord.findMany).mockResolvedValue([mockCostRecord]);

    const result = await caller.products.listCostHistory({ productId: "1" });

    expect(db.productCostRecord.findMany).toHaveBeenCalledWith({
      where: { productId: "1" },
      orderBy: { effectiveFrom: "desc" },
    });
    expect(result).toEqual([mockCostRecord]);
  });
});
