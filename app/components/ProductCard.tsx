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
      <div className="bg-white rounded-3xl border border-sky-100 overflow-hidden flex flex-col [box-shadow:5px_7px_16px_rgba(0,0,0,0.32)]">
        <div className="h-48 bg-sky-50 overflow-hidden relative">
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
            <h2 className="text-lg font-semibold text-blue-900">
              {product.name}
            </h2>
            <p className="text-sm text-blue-700 mt-1 leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-bold text-blue-900">
                  ${price.toFixed(2)}
                </span>
                <span className="text-xs text-sky-600 ml-1">
                  / {product.unitLabel}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity(product.id, quantity - 1)}
                  className="w-8 h-8 rounded-full bg-sky-100 text-blue-800 font-bold text-lg flex items-center justify-center hover:bg-sky-200 active:bg-sky-200 transition-colors disabled:opacity-30"
                  aria-label="Decrease quantity"
                  disabled={quantity === 0 || soldOut}
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold text-blue-900">
                  {quantity}
                </span>
                <button
                  onClick={soldOut ? undefined : handlePlusClick}
                  className="w-8 h-8 rounded-full bg-purple-800 text-white font-bold text-lg flex items-center justify-center hover:bg-purple-700 active:bg-purple-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Increase quantity"
                  disabled={soldOut}
                >
                  +
                </button>
              </div>
            </div>

            {showMaxHint && (
              <p className="text-xs text-blue-700 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 text-right">
                Only {product.unitsAvailable} {product.unitsAvailable === 1 ? "batch" : "batches"} available
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-sky-500">
              {product.batchSize}{" "}
              {product.batchSize === 1 ? "piece" : "pieces"} per {product.unitLabel}
            </p>
            {product.ingredients && (
              <button
                onClick={() => setShowIngredients(true)}
                className="flex items-center gap-1 text-xs text-blue-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded-lg hover:bg-sky-100 transition-colors"
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
              <h2 className="text-lg font-bold text-blue-900">Ingredients</h2>
              <button
                onClick={() => setShowIngredients(false)}
                className="text-sky-400 hover:text-blue-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="text-sm font-semibold text-blue-800 mb-1">{product.name}</p>
            <p className="text-sm text-blue-700 leading-relaxed">{product.ingredients}</p>
          </div>
        </div>
      )}
    </>
  );
}
