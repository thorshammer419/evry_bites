export const dynamic = "force-dynamic";

import { MenuClient } from "./components/MenuClient";
import { CustomerHeader } from "./components/CustomerHeader";
import { ScrollHint } from "./components/ScrollHint";
import { appRouter } from "../server/routers/_app";
import { createCallerFactory } from "../server/trpc";
import { NullNotifier } from "../lib/null-notifier";

const createCaller = createCallerFactory(appRouter);

export default async function Home() {
  const caller = createCaller({ notifier: new NullNotifier() });
  const products = await caller.products.listActive();

  return (
    <div className="min-h-screen bg-bakery-pattern">
      <CustomerHeader />

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-80">
        <MenuClient products={products} />
      </main>
      <ScrollHint />
    </div>
  );
}
