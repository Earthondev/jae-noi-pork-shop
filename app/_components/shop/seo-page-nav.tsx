"use client";

import { BottomNav } from "./bottom-nav";
import { useCheckoutDraft } from "../../_hooks/use-checkout-draft";

/**
 * These pages (product/how-to-order landing pages) stay server components
 * for their `export const metadata`, so the persistent nav lives in this
 * small client island instead — same pattern as app/track/order-tracker.tsx,
 * which has no local cart drawer either and just hands off to the home page.
 */
export function SeoPageNav({ activeTab }: { activeTab?: "home" | "products" | "track" | "cart" }) {
  const { draft } = useCheckoutDraft();
  const cartCount = Object.values(draft.quantities).reduce((a, b) => a + b, 0);
  const handleOpenCart = () => {
    window.location.href = "/?cart=open";
  };
  return <BottomNav cartCount={cartCount} onOpenCart={handleOpenCart} activeTab={activeTab} />;
}
