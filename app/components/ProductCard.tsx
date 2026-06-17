"use client";

import { useState } from "react";
import Image from "next/image";
import type { Product } from "@prisma/client";
import { useCart } from "../../lib/cart";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { cart, setQuantity } = useCart();
  const quantity = cart[product.id] ?? 0;
  const price = Number(product.price);
  const [showIngredients, setShowIngredients] = useState(false);
  const [showMaxHint, setShowMaxHint] = useState(false);
  const soldOut = product.unitsAvailable === 0;
  const atMax = product.unitsAvailable !== null && product.unitsAvailable !== undefined && quantity >= product.unitsAvailable;

  function handlePlusClick() {
    if (atMax) {
      setShowMaxHint(true);
      setTimeout(() => setShowMaxHint(false), 2500);
    } else {
      setQuantity(product.id, quantity + 1);
    }
  }

  return (
    <>
      <div className="bg-white rounded-3xl shadow-sm border border-amber-100 overflow-hidden flex flex-col">
        <div className="h-48 bg-amber-50 overflow-hidden relative">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              width={600}
              height={192}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl">
              🧁
            </div>
          )}
          {soldOut && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="bg-white text-red-700 font-bold text-sm px-3 py-1 rounded-full tracking-wide uppercase">
                Sold Out
              </span>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col flex-1 gap-3">
          <div>
            <h2 className="text-lg font-semibold text-amber-900">
              {product.name}
            </h2>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="mt-auto flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-amber-900">
                ${price.toFixed(2)}
              </span>
              <span className="text-xs text-amber-600 ml-1">
                / {product.unitLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(product.id, quantity - 1)}
                className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold text-lg flex items-center justify-center hover:bg-amber-200 active:bg-amber-300 transition-colors disabled:opacity-30"
                aria-label="Decrease quantity"
                disabled={quantity === 0 || soldOut}
              >
                −
              </button>
              <span className="w-6 text-center font-semibold text-amber-900">
                {quantity}
              </span>
              <div className="relative">
                {showMaxHint && (
                  <div className="absolute bottom-full mb-2 right-0 bg-amber-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none">
                    Only {product.unitsAvailable} available
                    <span className="absolute top-full right-3 border-4 border-transparent border-t-amber-900" />
                  </div>
                )}
                <button
                  onClick={soldOut ? undefined : handlePlusClick}
                  className="w-8 h-8 rounded-full bg-amber-800 text-white font-bold text-lg flex items-center justify-center hover:bg-amber-700 active:bg-amber-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Increase quantity"
                  disabled={soldOut}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-500">
              {product.batchSize}{" "}
              {product.batchSize === 1 ? "piece" : "pieces"} per {product.unitLabel}
            </p>
            {product.ingredients && (
              <button
                onClick={() => setShowIngredients(true)}
                className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors"
              >
                🧾 Ingredients
              </button>
            )}
          </div>
        </div>
      </div>

      {showIngredients && product.ingredients && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowIngredients(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-amber-900">Ingredients</h2>
              <button
                onClick={() => setShowIngredients(false)}
                className="text-amber-400 hover:text-amber-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm font-semibold text-amber-800 mb-1">{product.name}</p>
            <p className="text-sm text-amber-700 leading-relaxed">{product.ingredients}</p>
          </div>
        </div>
      )}
    </>
  );
}
