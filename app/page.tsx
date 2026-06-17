export const dynamic = "force-dynamic";

import { MenuClient } from "./components/MenuClient";
import { CustomerHeader } from "./components/CustomerHeader";
import { appRouter } from "../server/routers/_app";
import { createCallerFactory } from "../server/trpc";
import { NullNotifier } from "../lib/null-notifier";

const createCaller = createCallerFactory(appRouter);

export default async function Home() {
  const caller = createCaller({ notifier: new NullNotifier() });
  const products = await caller.products.listActive();

  return (
    <div className="min-h-screen bg-amber-50">
      <CustomerHeader />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-amber-700 mb-6">
          All items are baked fresh when you order. Select your quantities below
          and proceed when you&apos;re ready.
        </p>

        <MenuClient products={products} />
      </main>
    </div>
  );
}
