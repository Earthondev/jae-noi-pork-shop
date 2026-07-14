"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisibleProductStatus } from "../../lib/product-catalog";

export type Product = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  image: string;
  status: VisibleProductStatus;
};

export type PreorderRound = { id: string; deliveryDate: string; opensAt: string; closesAt: string; label: string; note: string };

type StorefrontResponse = {
  products: Product[];
  rounds: PreorderRound[];
  nextRound: PreorderRound | null;
  shippingFee: number | null;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  promptPayId: string | null;
  promptPayName: string | null;
  secureWriteReady: boolean;
  error?: string;
};

export type Fulfilment = "pickup" | "postal";

type UseStorefrontOptions = Readonly<{
  /** Re-fetches whenever the cart drawer opens, so prices/availability are always fresh at checkout. */
  cartOpen: boolean;
  /** Owned by `useCart`; called on every successful fetch so the cart stays reconciled with the catalog. */
  pruneUnavailable: (nextProducts: readonly Product[]) => string[];
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
  secureWriteReady: boolean;
  storeLoading: boolean;
  notice: string | null;
  setNotice: (notice: string | null) => void;
  refreshStorefront: () => Promise<void>;
}>;

export function useStorefront({ cartOpen, pruneUnavailable }: UseStorefrontOptions): UseStorefrontResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [rounds, setRounds] = useState<PreorderRound[]>([]);
  const [nextRound, setNextRound] = useState<PreorderRound | null>(null);
  const [selectedRound, setSelectedRound] = useState("");
  const [fulfilment, setFulfilment] = useState<Fulfilment>("postal");
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [pickupMapUrl, setPickupMapUrl] = useState<string | null>(null);
  const [promptPayId, setPromptPayId] = useState<string | null>(null);
  const [promptPayName, setPromptPayName] = useState<string | null>(null);
  const [secureWriteReady, setSecureWriteReady] = useState(false);
  const [storeLoading, setStoreLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const hasLoadedProductsRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refreshStorefront = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise = (async () => {
      try {
        const response = await fetch("/api/storefront", { cache: "no-store" });
        const data = (await response.json()) as StorefrontResponse;
        if (!response.ok) throw new Error(data.error ?? "โหลดข้อมูลร้านไม่สำเร็จ");
        if (!mountedRef.current) return;

        const removedProductNames = pruneUnavailable(data.products);
        if (removedProductNames.length > 0) {
          setNotice(`${removedProductNames.join(", ")} ไม่พร้อมขายแล้ว ระบบนำออกจากตะกร้าให้แล้ว`);
        }

        hasLoadedProductsRef.current = data.products.length > 0;
        setProducts(data.products);
        setRounds(data.rounds);
        setNextRound(data.nextRound);
        setSelectedRound((current) => {
          if (data.rounds.length === 1) return data.rounds[0].id;
          return data.rounds.some((round) => round.id === current) ? current : "";
        });
        setShippingFee(data.shippingFee);
        setPickupAddress(data.pickupAddress);
        setPickupMapUrl(data.pickupMapUrl);
        setPromptPayId(data.promptPayId);
        setPromptPayName(data.promptPayName);
        setSecureWriteReady(data.secureWriteReady);
      } catch (error: unknown) {
        if (mountedRef.current && !hasLoadedProductsRef.current) {
          setNotice(error instanceof Error ? error.message : "โหลดข้อมูลร้านไม่สำเร็จ");
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
  }, [pruneUnavailable]);

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
    secureWriteReady,
    storeLoading,
    notice,
    setNotice,
    refreshStorefront,
  };
}
