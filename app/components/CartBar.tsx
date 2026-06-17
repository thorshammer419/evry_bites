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
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t-4 border-blue-900 shadow-lg">
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-3">
        <div className="mb-3 p-2 bg-sky-50 border border-sky-200 rounded-lg">
          <p className="text-xs font-bold text-blue-900">DISCLAIMER:</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            This product was not produced in a commercial kitchen. It has been home-processed in a
            kitchen that may also process common food allergens such as tree nuts, peanuts, eggs,
            soy, wheat, milk, fish, and crustacean shellfish.
          </p>
        </div>
        <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
          {lineItems.map(({ product, quantity, subtotal }) => (
            <div
              key={product.id}
              className="flex justify-between text-sm text-blue-800"
            >
              <span>
                {product.name}{" "}
                <span className="text-sky-500">
                  × {quantity} {product.unitLabel}
                </span>
              </span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-sky-500 uppercase tracking-wide font-medium">
              Total
            </p>
            <p className="text-xl font-bold text-blue-900">
              ${total.toFixed(2)}
            </p>
          </div>

          <Link
            href="/order"
            className="bg-purple-800 text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-purple-700 active:bg-purple-900 transition-colors"
          >
            Proceed to Order
          </Link>
        </div>
      </div>
    </div>
  );
}
