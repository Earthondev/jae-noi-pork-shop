import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  shouldRetryGoogleSheetsError,
  type StorefrontData,
} from "../../../lib/google-sheets";
import { getStorefrontData } from "../../../db/storefront-repository";
import { loadResilientStorefront } from "../../../lib/storefront-resilience";
import { publicErrorBody } from "../../../lib/public-errors";
import { reportServerError } from "../../../lib/server-monitoring";

const STOREFRONT_CACHE_SECONDS = 30;
const STOREFRONT_CACHE_CONTROL = `public, max-age=0, s-maxage=${STOREFRONT_CACHE_SECONDS}`;

type CloudflareCacheStorage = CacheStorage & { default?: Cache };
type StorefrontBindings = { UPLOADS?: R2Bucket };

function storefrontCache(): Cache | null {
  const cacheStorage = (globalThis as typeof globalThis & { caches?: CloudflareCacheStorage }).caches;
  return cacheStorage?.default ?? null;
}

function cacheKeyFor(request: Request): Request {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString(), { method: "GET" });
}

export async function GET(request: Request) {
  const cache = storefrontCache();
  const cacheKey = cacheKeyFor(request);

  try {
    if (cache) {
      const cached = await cache.match(cacheKey).catch(() => null);
      if (cached) {
        const response = new Response(cached.body, cached);
        response.headers.set("X-Storefront-Cache", "HIT");
        return response;
      }
    }

    const bindings = env as unknown as StorefrontBindings;
    const result = await loadResilientStorefront({
      bucket: bindings.UPLOADS,
      loadFresh: (signal) => getStorefrontData({ signal }),
      validate: isStorefrontData,
      shouldRetry: shouldRetryGoogleSheetsError,
      timeoutMs: 5_000,
      maxAttempts: 2,
      retryDelayMs: 250,
      freshSource: "d1",
    });

    const headers = new Headers({
      "Cache-Control": STOREFRONT_CACHE_CONTROL,
      "Cloudflare-CDN-Cache-Control": `public, max-age=${STOREFRONT_CACHE_SECONDS}`,
      "X-Storefront-Attempts": String(result.attempts),
      "X-Storefront-Cache": "MISS",
      "X-Storefront-Snapshot-Saved-At": result.savedAt,
      "X-Storefront-Source": result.source,
    });
    if (result.source === "r2-stale") headers.set("Warning", '110 - "Response is stale"');
    if (result.source === "r2-stale") {
      reportServerError({
        event: "storefront_stale_snapshot",
        operation: "storefront.load",
        path: "/api/storefront",
        method: "GET",
        level: "warning",
        tags: { attempts: result.attempts },
      });
    }

    const response = NextResponse.json(result.data, { headers });
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    reportServerError({
      event: "storefront_unavailable",
      operation: "storefront.load",
      error,
      path: "/api/storefront",
      method: "GET",
    });
    return NextResponse.json(
      publicErrorBody("STORE_UNAVAILABLE"),
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}

function isStorefrontData(value: unknown): value is StorefrontData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StorefrontData>;
  return Boolean(
    Array.isArray(candidate.products) &&
      Array.isArray(candidate.rounds) &&
      candidate.content &&
      typeof candidate.content === "object" &&
      typeof (candidate.content as { storeName?: unknown }).storeName === "string" &&
      (candidate.content as { storeName: string }).storeName.trim().length > 0 &&
      candidate.secureWriteReady === true,
  );
}
