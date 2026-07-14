import { NextResponse } from "next/server";
import { getStorefrontData } from "../../../lib/google-sheets";

const STOREFRONT_CACHE_SECONDS = 30;
const STOREFRONT_CACHE_CONTROL = `public, max-age=0, s-maxage=${STOREFRONT_CACHE_SECONDS}`;

type CloudflareCacheStorage = CacheStorage & { default?: Cache };

function storefrontCache(): Cache | null {
  const cacheStorage = (globalThis as typeof globalThis & { caches?: CloudflareCacheStorage }).caches;
  return cacheStorage?.default ?? null;
}

function cacheKeyFor(request: Request): Request {
  return new Request(new URL(request.url).toString(), { method: "GET" });
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

    const response = NextResponse.json(await getStorefrontData(), {
      headers: {
        "Cache-Control": STOREFRONT_CACHE_CONTROL,
        "Cloudflare-CDN-Cache-Control": `public, max-age=${STOREFRONT_CACHE_SECONDS}`,
        "X-Storefront-Cache": "MISS",
      },
    });
    if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "โหลดข้อมูลร้านไม่สำเร็จ" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
