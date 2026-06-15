export const dynamic = "force-dynamic";

import { appRouter } from "../../server/routers/_app";
import { createCallerFactory } from "../../server/trpc";
import { NullNotifier } from "../../lib/null-notifier";
import { OrderFormClient } from "./OrderFormClient";

const createCaller = createCallerFactory(appRouter);

export default async function OrderPage() {
  const caller = createCaller({ notifier: new NullNotifier() });
  const products = await caller.products.listActive();

  return <OrderFormClient products={products} />;
}
