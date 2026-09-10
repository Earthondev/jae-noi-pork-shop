import { cache } from "react";
import { getStorefrontData, type StorefrontData } from "./storefront-repository";
import { loadResilientStorefront } from "../lib/storefront-resilience";

// Request-scoped: metadata, layout and page share one D1 read. No stale offers
// or cross-request HTML cache; admin changes are visible on the next request.
export const getPublicStorefront = cache(async () => {
  const result = await loadResilientStorefront<StorefrontData>({
    loadFresh: (signal) => getStorefrontData({ signal }),
    validate: (data): data is StorefrontData => typeof data === "object" && data !== null && "products" in data && Array.isArray(data.products),
    maxAttempts: 1,
    shouldRetry: () => false,
    timeoutMs: 5_000,
    freshSource: "d1",
  });
  return result.data;
});
