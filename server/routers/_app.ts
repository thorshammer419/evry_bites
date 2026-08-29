import { router, publicProcedure } from "../trpc";
import { productsRouter } from "./products";
import { ordersRouter } from "./orders";
import { salesRouter } from "./sales";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    timestamp: new Date(),
  })),
  products: productsRouter,
  orders: ordersRouter,
  sales: salesRouter,
});

export type AppRouter = typeof appRouter;
