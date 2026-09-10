import { getPublicStorefront } from "../../db/public-storefront";
import { catalogueSitemap } from "../../lib/catalogue-seo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storefront = await getPublicStorefront();
    return new Response(catalogueSitemap(storefront.products), {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    // Do not publish an empty sitemap during a transient database failure.
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
  }
}
