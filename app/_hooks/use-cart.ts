"use client";

import { useCallback, useRef, useState } from "react";
import type { Product } from "./use-storefront";

export type Quantities = Record<string, number>;

export type UseCartResult = Readonly<{
  quantities: Quantities;
  updateQuantity: (products: readonly Product[], productId: string, delta: number) => void;
  clearCart: () => void;
  /**
   * Reconciles the cart against a freshly fetched product list: any item that is no
   * longer purchasable (hidden, closed, or missing a price) is dropped from the cart.
   * Returns the display names of the removed products so the caller can surface a notice.
   * Must be called by `useStorefront` on every successful refresh (this is the one place
   * the two hooks intentionally interact) so the cart never holds a stale/unavailable item.
   */
  pruneUnavailable: (nextProducts: readonly Product[]) => string[];
}>;

export function useCart(): UseCartResult {
  const [quantities, setQuantities] = useState<Quantities>({});
  const quantitiesRef = useRef<Quantities>({});
  const previousProductsRef = useRef<readonly Product[]>([]);

  const updateQuantity = useCallback((products: readonly Product[], productId: string, delta: number) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (delta > 0 && (!product || product.status !== "เปิดขาย" || product.price === null)) return;
    setQuantities((current) => {
      const next = { ...current };
      const quantity = Math.max(0, (current[productId] ?? 0) + delta);
      if (quantity === 0) delete next[productId];
      else next[productId] = quantity;
      quantitiesRef.current = next;
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    quantitiesRef.current = {};
    setQuantities({});
  }, []);

  const pruneUnavailable = useCallback((nextProducts: readonly Product[]): string[] => {
    const nextProductsById = new Map(nextProducts.map((product) => [product.id, product]));
    const previousProductsById = new Map(previousProductsRef.current.map((product) => [product.id, product]));
    const nextQuantities: Quantities = {};
    const removedProductNames: string[] = [];

    for (const [productId, quantity] of Object.entries(quantitiesRef.current)) {
      if (quantity <= 0) continue;
      const product = nextProductsById.get(productId);
      if (product?.status === "เปิดขาย" && product.price !== null) {
        nextQuantities[productId] = quantity;
      } else {
        removedProductNames.push(product?.name ?? previousProductsById.get(productId)?.name ?? productId);
      }
    }

    if (removedProductNames.length > 0) {
      quantitiesRef.current = nextQuantities;
      setQuantities(nextQuantities);
    }
    previousProductsRef.current = nextProducts;
    return removedProductNames;
  }, []);

  return { quantities, updateQuantity, clearCart, pruneUnavailable };
}
