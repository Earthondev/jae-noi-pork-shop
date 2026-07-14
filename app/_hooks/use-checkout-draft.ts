"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_CHECKOUT_DRAFT,
  browserDraftStorage,
  clearCheckoutDraft,
  hasCheckoutDraftContent,
  readCheckoutDraft,
  reconcileDraftQuantities,
  writeCheckoutDraft,
  type CheckoutDraft,
  type DraftQuantities,
} from "../../lib/customer-draft";
import type { Product } from "./use-storefront";

export type Quantities = DraftQuantities;

export type UseCheckoutDraftResult = Readonly<{
  draft: CheckoutDraft;
  restored: boolean;
  hydrated: boolean;
  hasContent: boolean;
  setField: <Key extends keyof Omit<CheckoutDraft, "quantities">>(key: Key, value: CheckoutDraft[Key]) => void;
  updateQuantity: (products: readonly Product[], productId: string, delta: number) => void;
  pruneUnavailable: (products: readonly Product[]) => string[];
  clearDraft: () => void;
}>;

export function useCheckoutDraft(): UseCheckoutDraftResult {
  const [draft, setDraft] = useState<CheckoutDraft>(EMPTY_CHECKOUT_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftRef = useRef(draft);

  const replaceDraft = useCallback((next: CheckoutDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = readCheckoutDraft(browserDraftStorage());
      if (saved) {
        draftRef.current = saved;
        setDraft(saved);
        setRestored(true);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      writeCheckoutDraft(browserDraftStorage(), draftRef.current);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [draft, hydrated]);

  const setField = useCallback(<Key extends keyof Omit<CheckoutDraft, "quantities">>(key: Key, value: CheckoutDraft[Key]) => {
    replaceDraft({ ...draftRef.current, [key]: value });
  }, [replaceDraft]);

  const updateQuantity = useCallback((products: readonly Product[], productId: string, delta: number) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (delta > 0 && (!product || product.status !== "เปิดขาย" || product.price === null)) return;
    const quantities = { ...draftRef.current.quantities };
    const quantity = Math.min(99, Math.max(0, (quantities[productId] ?? 0) + delta));
    if (quantity === 0) delete quantities[productId];
    else quantities[productId] = quantity;
    replaceDraft({ ...draftRef.current, quantities });
  }, [replaceDraft]);

  const pruneUnavailable = useCallback((products: readonly Product[]): string[] => {
    const reconciled = reconcileDraftQuantities(draftRef.current.quantities, products);
    if (!sameQuantities(draftRef.current.quantities, reconciled.quantities)) {
      replaceDraft({ ...draftRef.current, quantities: reconciled.quantities });
    }
    return reconciled.unavailableNames;
  }, [replaceDraft]);

  const clearDraft = useCallback(() => {
    clearCheckoutDraft(browserDraftStorage());
    setRestored(false);
    replaceDraft({ ...EMPTY_CHECKOUT_DRAFT, quantities: {} });
  }, [replaceDraft]);

  return {
    draft,
    restored,
    hydrated,
    hasContent: hasCheckoutDraftContent(draft),
    setField,
    updateQuantity,
    pruneUnavailable,
    clearDraft,
  };
}

function sameQuantities(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftEntries = Object.entries(left);
  return leftEntries.length === Object.keys(right).length && leftEntries.every(([id, quantity]) => right[id] === quantity);
}
