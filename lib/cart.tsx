"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "evry_bites_cart";

// productId → quantity in batches
type CartState = Record<string, number>;

interface CartContext {
  cart: CartState;
  hydrated: boolean;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  // Removes stale product IDs from cart; returns the removed IDs.
  // Call once after hydration — use the returned list to show a banner.
  reconcile: (activeProductIds: string[]) => string[];
}

const CartContext = createContext<CartContext | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartState>({});
  const [hydrated, setHydrated] = useState(false);

  // Always-current mirror of cart state for synchronous reads in reconcile.
  const cartRef = useRef<CartState>({});
  useEffect(() => {
    cartRef.current = cart;
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCart(JSON.parse(stored));
    } catch {
      // corrupted storage — start fresh
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: quantity };
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const reconcile = useCallback((activeProductIds: string[]): string[] => {
    const activeSet = new Set(activeProductIds);
    const staleIds = Object.keys(cartRef.current).filter((id) => !activeSet.has(id));
    if (staleIds.length > 0) {
      setCart((prev) => {
        const next = { ...prev };
        staleIds.forEach((id) => delete next[id]);
        return next;
      });
    }
    return staleIds;
  }, []);

  const totalItems = Object.values(cart).reduce((sum, q) => sum + q, 0);

  return (
    <CartContext.Provider
      value={{ cart, hydrated, setQuantity, clearCart, totalItems, reconcile }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
