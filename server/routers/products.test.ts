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
  active: true,
  createdAt: new Date(),
};

describe("products.listActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only active products ordered by name", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);

    await caller.products.listActive();

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns the products from the database", async () => {
    const products = [
      { ...mockProduct, id: "1", name: "Brownies" },
      { ...mockProduct, id: "2", name: "Cookies" },
    ];
    vi.mocked(db.product.findMany).mockResolvedValue(products);

    const result = await caller.products.listActive();

    expect(result).toEqual(products);
  });
});

describe("products.listAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries all products ordered by name (no active filter)", async () => {
    const products = [
      { ...mockProduct, id: "1", name: "Brownies", active: false },
      { ...mockProduct, id: "2", name: "Cookies", active: true },
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
      active: true,
    };

    await caller.products.create(input);

    expect(db.product.create).toHaveBeenCalledWith({
      data: {
        name: "Cookies",
        description: "Fresh cookies",
        price: "12.00",
        batchSize: 12,
        unitLabel: "dozen",
        imageUrl: null,
        active: true,
      },
    });
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
      active: true,
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
      active: true,
    });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: {
        name: "Updated Cookies",
        description: "Even fresher cookies",
        price: "14.00",
        batchSize: 12,
        unitLabel: "dozen",
        imageUrl: null,
        active: true,
      },
    });
  });
});

describe("products.toggleActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flips active from true to false", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({
      ...mockProduct,
      active: true,
    });
    vi.mocked(db.product.update).mockResolvedValue({
      ...mockProduct,
      active: false,
    });

    const result = await caller.products.toggleActive({ id: "1" });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { active: false },
    });
    expect(result.active).toBe(false);
  });

  it("flips active from false to true", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({
      ...mockProduct,
      active: false,
    });
    vi.mocked(db.product.update).mockResolvedValue({
      ...mockProduct,
      active: true,
    });

    const result = await caller.products.toggleActive({ id: "1" });

    expect(db.product.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { active: true },
    });
    expect(result.active).toBe(true);
  });
});
