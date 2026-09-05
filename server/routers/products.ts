import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";
import { isDecommissioned } from "../../lib/product-visibility";

export const productsRouter = router({
  listPosVisible: publicProcedure.query(() =>
    db.product.findMany({
      where: { posVisible: true },
      orderBy: { name: "asc" },
    })
  ),

  listStorefrontVisible: publicProcedure.query(() =>
    db.product.findMany({
      where: { storefrontVisible: true },
      orderBy: { name: "asc" },
    })
  ),

  listAll: publicProcedure.query(() =>
    db.product.findMany({
      orderBy: { name: "asc" },
    })
  ),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        price: z.string(),
        batchSize: z.number().int().positive(),
        unitLabel: z.string().min(1),
        imageUrl: z.string().optional(),
        posVisible: z.boolean().default(true),
        storefrontVisible: z.boolean().default(true),
        ingredients: z.string().optional(),
        unitsAvailable: z.number().int().min(0).optional(),
      })
    )
    .mutation(({ input }) =>
      db.product.create({
        data: {
          name: input.name,
          description: input.description,
          price: input.price,
          batchSize: input.batchSize,
          unitLabel: input.unitLabel,
          imageUrl: input.imageUrl || null,
          posVisible: input.posVisible,
          storefrontVisible: input.storefrontVisible,
          ingredients: input.ingredients || null,
          unitsAvailable: input.unitsAvailable ?? null,
        },
      })
    ),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().min(1),
        price: z.string(),
        batchSize: z.number().int().positive(),
        unitLabel: z.string().min(1),
        imageUrl: z.string().optional(),
        posVisible: z.boolean(),
        storefrontVisible: z.boolean(),
        ingredients: z.string().optional(),
        unitsAvailable: z.number().int().min(0).optional(),
      })
    )
    .mutation(({ input }) =>
      db.product.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          price: input.price,
          batchSize: input.batchSize,
          unitLabel: input.unitLabel,
          imageUrl: input.imageUrl || null,
          posVisible: input.posVisible,
          storefrontVisible: input.storefrontVisible,
          ingredients: input.ingredients || null,
          unitsAvailable: input.unitsAvailable ?? null,
        },
      })
    ),

  // The admin product list's single quick-action button: pulls a product
  // entirely (both flags off) or brings it fully back (both on). Independent
  // per-channel control lives in the edit form instead.
  toggleVisibility: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const product = await db.product.findUnique({ where: { id: input.id } });
      if (!product) throw new Error("Product not found");
      const shouldReactivate = isDecommissioned(product);
      return db.product.update({
        where: { id: input.id },
        data: { posVisible: shouldReactivate, storefrontVisible: shouldReactivate },
      });
    }),

  addCostRecord: publicProcedure
    .input(
      z.object({
        productId: z.string(),
        costPerBatch: z.string(),
        effectiveFrom: z.string(),
      })
    )
    .mutation(({ input }) =>
      db.productCostRecord.create({
        data: {
          productId: input.productId,
          costPerBatch: input.costPerBatch,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
        },
      })
    ),

  listCostHistory: publicProcedure
    .input(z.object({ productId: z.string() }))
    .query(({ input }) =>
      db.productCostRecord.findMany({
        where: { productId: input.productId },
        orderBy: { effectiveFrom: "desc" },
      })
    ),
});
