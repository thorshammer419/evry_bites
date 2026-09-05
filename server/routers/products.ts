import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "../../lib/db";

export const productsRouter = router({
  listActive: publicProcedure.query(() =>
    db.product.findMany({
      where: { active: true },
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
        active: z.boolean().default(true),
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
          active: input.active,
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
        active: z.boolean(),
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
          active: input.active,
          ingredients: input.ingredients || null,
          unitsAvailable: input.unitsAvailable ?? null,
        },
      })
    ),

  toggleActive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const product = await db.product.findUnique({ where: { id: input.id } });
      if (!product) throw new Error("Product not found");
      return db.product.update({
        where: { id: input.id },
        data: { active: !product.active },
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
