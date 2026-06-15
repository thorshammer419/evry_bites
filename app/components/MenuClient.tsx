"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@prisma/client";
import { CartProvider, useCart } from "../../lib/cart";
import { ProductCard } from "./ProductCard";
import { CartBar } from "./CartBar";

interface MenuClientProps {
  products: Product[];
}

function MenuClientInner({ products }: MenuClientProps) {
  const { cart, hydrated, reconcile } = useCart();
  const [removedItems, setRemovedItems] = useState<string[]>([]);
  const hasReconciled = useRef(false);

  useEffect(() => {
    if (!hydrated || hasReconciled.current) return;
    hasReconciled.current = true;
    const removed = reconcile(products.map((p) => p.id));
    if (removed.length > 0) setRemovedItems(removed);
  }, [hydrated, cart, products, reconcile]);

  return (
    <>
      {removedItems.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-100 border border-amber-300 px-4 py-3 text-sm text-amber-800">
          Some items in your cart are no longer available and were removed.
          <button
            className="ml-2 underline font-medium"
            onClick={() => setRemovedItems([])}
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
