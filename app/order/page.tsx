import { appRouter } from "../../server/routers/_app";
import { createCallerFactory } from "../../server/trpc";
import { OrderFormClient } from "./OrderFormClient";

const createCaller = createCallerFactory(appRouter);

export default async function OrderPage() {
  const caller = createCaller({});
  const products = await caller.products.listActive();

  return <OrderFormClient products={products} />;
}
