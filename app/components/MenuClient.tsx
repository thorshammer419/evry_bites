"use client";

import { useEffect, useState } from "react";
import type { Product } from "@prisma/client";
import { CartProvider } from "../../lib/cart";
import { ProductCard } from "./ProductCard";
import { CartBar } from "./CartBar";

const STORAGE_KEY = "evry_bites_cart";

interface MenuClientProps {
  products: Product[];
}

function MenuClientInner({ products }: MenuClientProps) {
  const [deactivatedNames, setDeactivatedNames] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const cart: Record<string, number> = JSON.parse(stored);
      const activeIds = new Set(products.map((p) => p.id));
      const staleIds = Object.keys(cart).filter((id) => !activeIds.has(id));
      if (staleIds.length === 0) return;

      // Find names from the time of removal — we only have ids, so show count
      setDeactivatedNames(staleIds.map((id) => id));
      const cleaned = { ...cart };
      staleIds.forEach((id) => delete cleaned[id]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      // ignore
    }
  }, [products]);

  return (
    <>
      {deactivatedNames.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-100 border border-amber-300 px-4 py-3 text-sm text-amber-800">
          Some items in your cart are no longer available and were removed.
          <button
            className="ml-2 underline font-medium"
            onClick={() => setDeactivatedNames([])}
          >
            Dismiss
          </button>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-16 text-amber-600">
          <p className="text-4xl mb-3">🫙</p>
          <p className="font-medium">Nothing in the case right now.</p>
          <p className="text-sm mt-1">Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-40">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <CartBar products={products} />
    </>
  );
}

export function MenuClient({ products }: MenuClientProps) {
  return (
    <CartProvider>
      <MenuClientInner products={products} />
    </CartProvider>
  );
}
