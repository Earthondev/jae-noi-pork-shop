"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisibleProductStatus } from "../../lib/product-catalog";
import { PUBLIC_ERROR_MESSAGES } from "../../lib/public-errors";
import type { RoundProductScope } from "../../lib/round-products";

export type Product = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  images?: string[];
  badge: string;
  price: number | null;
  image: string;
  status: VisibleProductStatus;
  category: string;
};

export type PreorderRound = {
  id: string;
  deliveryDate: string;
  opensAt: string;
  closesAt: string;
  label: string;
  note: string;
  productScope: RoundProductScope;
  productIds: string[];
};

export type StorefrontContent = {
  storeName: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  storyTitle: string;
  storyDescription: string;
  phonePrimary: string;
  phoneSecondary: string;
  storeLogoUrl: string;
  storeCoverUrl: string;
};

export type StorefrontResponse = {
  products: Product[];
  categoryOrder: string[];
  rounds: PreorderRound[];
  nextRound: PreorderRound | null;
  shippingFee: number | null;
  freeShippingMinimum: number | null;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  promptPayId: string | null;
  promptPayName: string | null;
  content: StorefrontContent;
  secureWriteReady: boolean;
  error?: string;
};

export type Fulfilment = "pickup" | "postal";

type UseStorefrontOptions = Readonly<{
  /**
   * The catalogue as the server already rendered it. Seeding state from it is
   * what puts real product names, prices and round status into the HTML a
   * crawler (and an AI assistant, which usually does not run JavaScript at all)
   * receives — and it removes the empty-then-populated flash for customers.
   * Null when the database read failed; the client fetch then fills in as before.
   */
  initial: StorefrontResponse | null;
  /** Re-fetches whenever the cart drawer opens, so prices/availability are always fresh at checkout. */
  cartOpen: boolean;
  /** Owned by `useCheckoutDraft`; called on every successful fetch so restored items stay reconciled with the live catalog. */
  pruneUnavailable: (nextProducts: readonly Product[]) => string[];
  selectedRound: string;
  setSelectedRound: (round: string) => void;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
}>;

export type UseStorefrontResult = Readonly<{
  products: Product[];
  categoryOrder: string[];
  rounds: PreorderRound[];
  nextRound: PreorderRound | null;
  selectedRound: string;
  setSelectedRound: (round: string) => void;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
  shippingFee: number | null;
  freeShippingMinimum: number | null;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  promptPayId: string | null;
  promptPayName: string | null;
  content: StorefrontContent;
  secureWriteReady: boolean;
  storeLoading: boolean;
  orderingOpen: boolean;
  notice: string | null;
  setNotice: (notice: string | null) => void;
  refreshStorefront: () => Promise<StorefrontResponse | null>;
}>;

export function useStorefront({
  initial,
  cartOpen,
  pruneUnavailable,
  selectedRound,
  setSelectedRound,
  fulfilment,
  setFulfilment,
}: UseStorefrontOptions): UseStorefrontResult {
  const [products, setProducts] = useState<Product[]>(initial?.products ?? []);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(initial?.categoryOrder ?? []);
  const [rounds, setRounds] = useState<PreorderRound[]>(initial?.rounds ?? []);
  const [nextRound, setNextRound] = useState<PreorderRound | null>(initial?.nextRound ?? null);
  const [shippingFee, setShippingFee] = useState<number | null>(initial?.shippingFee ?? null);
  const [freeShippingMinimum, setFreeShippingMinimum] = useState<number | null>(initial?.freeShippingMinimum ?? null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(initial?.pickupAddress ?? null);
  const [pickupMapUrl, setPickupMapUrl] = useState<string | null>(initial?.pickupMapUrl ?? null);
  const [promptPayId, setPromptPayId] = useState<string | null>(initial?.promptPayId ?? null);
  const [promptPayName, setPromptPayName] = useState<string | null>(initial?.promptPayName ?? null);
  const [content, setContent] = useState<StorefrontContent>(initial?.content ?? {
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    heroTitle: "แหนมหมูจากตะคร้อ",
    heroHighlight: "สั่งง่ายถึงบ้าน",
    heroDescription: "แหนมหมู ไส้กรอกอีสาน และกากหมูโบราณ (แคปหมูติดมัน) สูตรร้านเจ๊น้อย เลือกของอร่อย ใส่ตะกร้า แล้วสั่งได้เลย",
    storyTitle: "ของดีจากเขียงหมูตะคร้อ",
    storyDescription: "รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ๊น้อยถึงมือลูกค้า",
    phonePrimary: "087-241-6773",
    phoneSecondary: "061-093-5329",
    storeLogoUrl: "/images/products/jae-noi-shop-logo.jpg",
    storeCoverUrl: "/images/products/jae-noi-holding-two-naem-pork-bags.jpg",
  });
  const [secureWriteReady, setSecureWriteReady] = useState(initial?.secureWriteReady ?? false);
  // Already loaded when the server handed us a catalogue: the first paint shows
  // the real shop rather than a skeleton, and `orderingOpen` below is decided by
  // the rounds the server saw instead of waiting a round-trip to find out.
  const [storeLoading, setStoreLoading] = useState(initial === null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasLoadedProductsRef = useRef((initial?.products.length ?? 0) > 0);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<StorefrontResponse | null> | null>(null);
  const selectedRoundRef = useRef(selectedRound);
  const fulfilmentRef = useRef(fulfilment);

  useEffect(() => { selectedRoundRef.current = selectedRound; }, [selectedRound]);
  useEffect(() => { fulfilmentRef.current = fulfilment; }, [fulfilment]);

  const refreshStorefront = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise: Promise<StorefrontResponse | null> = (async () => {
      try {
        const response = await fetch("/api/storefront", { cache: "no-store" });
        const data = (await response.json()) as StorefrontResponse;
        if (!response.ok) throw new Error(PUBLIC_ERROR_MESSAGES.STORE_UNAVAILABLE);
        if (!mountedRef.current) return null;

        const removedProductNames = pruneUnavailable(data.products);
        if (removedProductNames.length > 0) {
          setNotice(`${removedProductNames.join(", ")} ไม่พร้อมขายแล้ว ระบบนำออกจากตะกร้าให้แล้ว`);
        }

        hasLoadedProductsRef.current = data.products.length > 0;
        setProducts(data.products);
        setCategoryOrder(data.categoryOrder ?? []);
        setRounds(data.rounds);
        setNextRound(data.nextRound);
        const currentRound = selectedRoundRef.current;
        const validRound = data.rounds.length === 1
          ? data.rounds[0].id
          : data.rounds.some((round) => round.id === currentRound) ? currentRound : "";
        if (validRound !== currentRound) setSelectedRound(validRound);
        if (!data.pickupAddress && fulfilmentRef.current === "pickup") setFulfilment("postal");
        setShippingFee(data.shippingFee);
        setFreeShippingMinimum(data.freeShippingMinimum);
        setPickupAddress(data.pickupAddress);
        setPickupMapUrl(data.pickupMapUrl);
        setPromptPayId(data.promptPayId);
        setPromptPayName(data.promptPayName);
        setContent(data.content);
        setSecureWriteReady(data.secureWriteReady);
        return data;
      } catch {
        if (mountedRef.current && !hasLoadedProductsRef.current) {
          setNotice(PUBLIC_ERROR_MESSAGES.STORE_UNAVAILABLE);
        }
        return null;
      } finally {
        if (mountedRef.current) setStoreLoading(false);
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [pruneUnavailable, setFulfilment, setSelectedRound]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStorefront();
    // Paused while the tab is hidden — a backgrounded tab has no reason to
    // keep polling every 30s, and refreshing immediately on becoming visible
    // again already covers the "came back after a while" case.
    let interval: number | null = null;
    const startInterval = () => {
      if (interval !== null) return;
      interval = window.setInterval(() => void refreshStorefront(), 30_000);
    };
    const stopInterval = () => {
      if (interval === null) return;
      window.clearInterval(interval);
      interval = null;
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshStorefront();
        startInterval();
      } else {
        stopInterval();
      }
    };
    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mountedRef.current = false;
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshStorefront]);

  useEffect(() => {
    if (cartOpen) void refreshStorefront();
  }, [cartOpen, refreshStorefront]);

  const orderingOpen = !storeLoading && rounds.length > 0;

  return {
    products,
    categoryOrder,
    rounds,
    nextRound,
    selectedRound,
    setSelectedRound,
    fulfilment,
    setFulfilment,
    shippingFee,
    freeShippingMinimum,
    pickupAddress,
    pickupMapUrl,
    promptPayId,
    promptPayName,
    content,
    secureWriteReady,
    storeLoading,
    orderingOpen,
    notice,
    setNotice,
    refreshStorefront,
  };
}
