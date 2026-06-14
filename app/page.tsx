import { MenuClient } from "./components/MenuClient";
import { appRouter } from "../server/routers/_app";
import { createCallerFactory } from "../server/trpc";

const createCaller = createCallerFactory(appRouter);

export default async function Home() {
  const caller = createCaller({});
  const products = await caller.products.listActive();

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-3xl">🧁</span>
          <div>
            <h1 className="text-xl font-bold text-amber-900 leading-none">
              EvryBites
            </h1>
            <p className="text-xs text-amber-600">Fresh baked to order</p>
          </div>
        </div>
      </header>

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
