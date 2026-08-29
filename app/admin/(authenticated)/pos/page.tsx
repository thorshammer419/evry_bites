import { appRouter } from "../../../../server/routers/_app";
import { createCallerFactory } from "../../../../server/trpc";
import { NullNotifier } from "../../../../lib/null-notifier";
import { PosClient } from "./PosClient";

export const dynamic = "force-dynamic";

const createCaller = createCallerFactory(appRouter);

export default async function AdminPosPage() {
  const caller = createCaller({ notifier: new NullNotifier() });
  const products = await caller.products.listActive();

  return <PosClient products={products} />;
}
