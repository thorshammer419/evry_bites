import { router, publicProcedure } from "../trpc";
import { productsRouter } from "./products";
import { ordersRouter } from "./orders";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    timestamp: new Date(),
  })),
  products: productsRouter,
  orders: ordersRouter,
});

export type AppRouter = typeof appRouter;
