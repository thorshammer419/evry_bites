"use client";

import Link from "next/link";
import { useCart } from "../../lib/cart";
import type { Product } from "@prisma/client";

interface CartBarProps {
  products: Product[];
}

export function CartBar({ products }: CartBarProps) {
  const { cart } = useCart();

  const lineItems = products
    .filter((p) => cart[p.id] && cart[p.id] > 0)
    .map((p) => ({
      product: p,
      quantity: cart[p.id],
      subtotal: Number(p.price) * cart[p.id],
    }));

  const total = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

  if (lineItems.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-amber-200 shadow-lg">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
          {lineItems.map(({ product, quantity, subtotal }) => (
            <div
              key={product.id}
              className="flex justify-between text-sm text-amber-800"
            >
              <span>
                {product.name}{" "}
                <span className="text-amber-500">
                  × {quantity} {product.unitLabel}
                </span>
              </span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-amber-500 uppercase tracking-wide font-medium">
              Total
            </p>
            <p className="text-xl font-bold text-amber-900">
              ${total.toFixed(2)}
            </p>
          </div>

          <Link
            href="/order"
            className="bg-amber-800 text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-amber-700 active:bg-amber-900 transition-colors"
          >
            Proceed to Order →
          </Link>
        </div>
      </div>
    </div>
  );
}
