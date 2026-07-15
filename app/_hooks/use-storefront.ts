"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisibleProductStatus } from "../../lib/product-catalog";
import { PUBLIC_ERROR_MESSAGES } from "../../lib/public-errors";

export type Product = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  image: string;
  status: VisibleProductStatus;
  category: string;
};

export type PreorderRound = { id: string; deliveryDate: string; opensAt: string; closesAt: string; label: string; note: string };

export type StorefrontContent = {
  storeName: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  announcementText: string;
  storyTitle: string;
  storyDescription: string;
  phonePrimary: string;
  phoneSecondary: string;
  storeLogoUrl: string;
  storeCoverUrl: string;
};

type StorefrontResponse = {
  products: Product[];
  rounds: PreorderRound[];
  nextRound: PreorderRound | null;
  shippingFee: number | null;
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
  rounds: PreorderRound[];
  nextRound: PreorderRound | null;
  selectedRound: string;
  setSelectedRound: (round: string) => void;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
  shippingFee: number | null;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  promptPayId: string | null;
  promptPayName: string | null;
  content: StorefrontContent;
  secureWriteReady: boolean;
  storeLoading: boolean;
  notice: string | null;
  setNotice: (notice: string | null) => void;
  refreshStorefront: () => Promise<void>;
}>;

export function useStorefront({
  cartOpen,
  pruneUnavailable,
  selectedRound,
  setSelectedRound,
  fulfilment,
  setFulfilment,
}: UseStorefrontOptions): UseStorefrontResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [rounds, setRounds] = useState<PreorderRound[]>([]);
  const [nextRound, setNextRound] = useState<PreorderRound | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [pickupMapUrl, setPickupMapUrl] = useState<string | null>(null);
  const [promptPayId, setPromptPayId] = useState<string | null>(null);
  const [promptPayName, setPromptPayName] = useState<string | null>(null);
  const [content, setContent] = useState<StorefrontContent>({
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    heroTitle: "อร่อยถึงเครื่อง",
    heroHighlight: "สั่งง่ายถึงบ้าน",
    heroDescription: "แหนมหมู ไส้กรอกอีสาน และแคปหมูสูตรร้านเจ๊น้อย เลือกของอร่อย ใส่ตะกร้า แล้วสั่งได้เลย",
    announcementText: "ทำสดทุกวัน ◆ สูตรดั้งเดิมตะคร้อ ◆ แพ็กพร้อมส่ง ◆ อร่อยถึงเครื่อง",
    storyTitle: "ของดีจากเขียงหมูตะคร้อ",
    storyDescription: "รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ๊น้อยถึงมือลูกค้า",
    phonePrimary: "087-2416773",
    phoneSecondary: "087-8755479",
    storeLogoUrl: "/images/products/jae-noi-shop-logo.jpg",
    storeCoverUrl: "/images/products/jae-noi-holding-two-naem-pork-bags.jpg",
  });
  const [secureWriteReady, setSecureWriteReady] = useState(false);
  const [storeLoading, setStoreLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const hasLoadedProductsRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const selectedRoundRef = useRef(selectedRound);
  const fulfilmentRef = useRef(fulfilment);

  useEffect(() => { selectedRoundRef.current = selectedRound; }, [selectedRound]);
  useEffect(() => { fulfilmentRef.current = fulfilment; }, [fulfilment]);

  const refreshStorefront = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise = (async () => {
      try {
        const response = await fetch("/api/storefront", { cache: "no-store" });
        const data = (await response.json()) as StorefrontResponse;
        if (!response.ok) throw new Error(PUBLIC_ERROR_MESSAGES.STORE_UNAVAILABLE);
        if (!mountedRef.current) return;

        const removedProductNames = pruneUnavailable(data.products);
        if (removedProductNames.length > 0) {
          setNotice(`${removedProductNames.join(", ")} ไม่พร้อมขายแล้ว ระบบนำออกจากตะกร้าให้แล้ว`);
        }

        hasLoadedProductsRef.current = data.products.length > 0;
        setProducts(data.products);
        setRounds(data.rounds);
        setNextRound(data.nextRound);
        const currentRound = selectedRoundRef.current;
        const validRound = data.rounds.length === 1
          ? data.rounds[0].id
          : data.rounds.some((round) => round.id === currentRound) ? currentRound : "";
        if (validRound !== currentRound) setSelectedRound(validRound);
        if (!data.pickupAddress && fulfilmentRef.current === "pickup") setFulfilment("postal");
        setShippingFee(data.shippingFee);
        setPickupAddress(data.pickupAddress);
        setPickupMapUrl(data.pickupMapUrl);
        setPromptPayId(data.promptPayId);
        setPromptPayName(data.promptPayName);
        setContent(data.content);
        setSecureWriteReady(data.secureWriteReady);
      } catch {
        if (mountedRef.current && !hasLoadedProductsRef.current) {
          setNotice(PUBLIC_ERROR_MESSAGES.STORE_UNAVAILABLE);
        }
      } finally {
        if (mountedRef.current) setStoreLoading(false);
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [pruneUnavailable, setFulfilment, setSelectedRound]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStorefront();
    const interval = window.setInterval(() => void refreshStorefront(), 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshStorefront();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshStorefront]);

  useEffect(() => {
    if (cartOpen) void refreshStorefront();
  }, [cartOpen, refreshStorefront]);

  return {
    products,
    rounds,
    nextRound,
    selectedRound,
    setSelectedRound,
    fulfilment,
    setFulfilment,
    shippingFee,
    pickupAddress,
    pickupMapUrl,
    promptPayId,
    promptPayName,
    content,
    secureWriteReady,
    storeLoading,
    notice,
    setNotice,
    refreshStorefront,
  };
}
