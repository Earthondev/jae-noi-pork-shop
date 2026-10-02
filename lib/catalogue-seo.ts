import type { StorefrontData } from "../db/storefront-repository";
import { displayProductName, type CatalogProduct } from "./product-catalog";
import { roundIncludesProduct } from "./round-products";
import { postalShippingCost } from "./shipping";
import { breadcrumbs, jsonLd, PRODUCT_GUIDES, SHOP, SITE_URL } from "./seo";

export type CatalogueContext = Pick<StorefrontData, "rounds" | "shippingFee" | "freeShippingMinimum">;

// A separate segment avoids collisions between admin-chosen IDs and guide URLs.
export function productPath(id: string): string {
  return `/products/item/${encodeURIComponent(id)}`;
}

export function productOrderState(product: CatalogProduct, context: CatalogueContext) {
  if (product.status === "ปิดชั่วคราว") return { canOrder: false, label: "ปิดรับชั่วคราว" };
  if (product.status !== "เปิดขาย" || !validPrice(product.price)) return { canOrder: false, label: "รอข้อมูล" };
  if (context.rounds.length === 0) return { canOrder: false, label: "รอเปิดรอบ" };
  if (!context.rounds.some((round) => roundIncludesProduct(round, product.id))) {
    return { canOrder: false, label: "ไม่มีในรอบนี้" };
  }
  return { canOrder: true, label: "เปิดรับพรีออเดอร์" };
}

/**
 * Search snippet for a product detail page. It targets purchase intent so it
 * doesn't compete with the editorial guide (`/products/naem-moo` etc.) for the
 * same "<product> บัวใหญ่" phrase, and states only facts the checkout always
 * offers: rounds, PromptPay, pickup, and postal delivery when a fee is set.
 * Price stays out on purpose — Google can keep a title for days after an admin
 * price change, and the page itself shows the live price.
 */
export function productPageMeta(product: CatalogProduct, storeName: string, context: Pick<CatalogueContext, "shippingFee">) {
  const name = displayProductName(product.name);
  // "รอข้อมูลหน่วยขาย" is the catalogue's placeholder, not a unit to advertise;
  // a unit the name already states ("แคปหมู แบบ 1 กิโลกรัม") isn't repeated.
  const rawUnit = product.unit.trim();
  const unit = rawUnit.startsWith("รอข้อมูล") || name.includes(rawUnit) ? "" : rawUnit;
  const fulfilment = context.shippingFee === null ? "รับเองที่หน้าร้าน" : "รับเองที่หน้าร้านหรือส่งไปรษณีย์";
  return {
    title: `${name} สั่งออนไลน์ | ${storeName} บัวใหญ่`,
    description: `สั่ง${name}${unit ? ` ขนาด ${unit}` : ""} จาก${storeName} อ.บัวใหญ่ จ.นครราชสีมา สั่งตามรอบขาย โอนผ่านพร้อมเพย์ ${fulfilment} ดูราคาล่าสุดและรูปสินค้าได้ในหน้านี้`,
  };
}

function validPrice(price: number | null): price is number {
  return price !== null && Number.isFinite(price) && price > 0;
}

export function productJsonLdNode(product: CatalogProduct, context: CatalogueContext) {
  const url = `${SITE_URL}${productPath(product.id)}`;
  const state = productOrderState(product, context);
  // Shipping is for one sale unit; quantity-based promotions remain visible on
  // the page and use the same calculation as checkout. Never invent a fee.
  const shipping = validPrice(product.price) ? postalShippingCost(product.price, context) : null;
  return {
    "@type": "Product",
    "@id": `${url}#product`,
    sku: product.id,
    name: displayProductName(product.name),
    description: product.detail,
    image: product.images?.length ? product.images.map((src) => new URL(src, SITE_URL).href) : new URL(product.image, SITE_URL).href,
    category: product.category,
    size: product.unit,
    url,
    brand: { "@type": "Brand", name: SHOP.name },
    ...(validPrice(product.price) && product.status !== "รอข้อมูล" ? {
      offers: {
        "@type": "Offer",
        url,
        price: product.price,
        priceCurrency: "THB",
        // Open rounds accept preorders, not ready-to-ship inventory.
        availability: state.canOrder ? "https://schema.org/PreOrder" : "https://schema.org/OutOfStock",
        seller: { "@id": `${SITE_URL}/#store` },
        ...(shipping !== null && Number.isFinite(shipping) && shipping >= 0 ? {
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "TH" },
            shippingRate: { "@type": "MonetaryAmount", currency: "THB", value: shipping },
          },
        } : {}),
      },
    } : {}),
  };
}

export function catalogueJsonLd(products: readonly CatalogProduct[], context: CatalogueContext): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/#catalogue`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem", position: index + 1,
      // Incomplete entries stay crawlable without claiming an invalid Offer.
      item: product.status === "รอข้อมูล" || !validPrice(product.price)
        ? { "@type": "WebPage", name: displayProductName(product.name), url: `${SITE_URL}${productPath(product.id)}` }
        : productJsonLdNode(product, context),
    })),
  });
}

export function productPageJsonLd(product: CatalogProduct, context: CatalogueContext): string {
  const node = productJsonLdNode(product, context);
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      ...(node.offers ? [node] : []),
      breadcrumbs(displayProductName(product.name), `${SITE_URL}${productPath(product.id)}`),
    ],
  });
}

export function catalogueSitemap(products: readonly CatalogProduct[]): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const staticPaths = ["", "/products", ...PRODUCT_GUIDES.map((guide) => `/products/${guide.slug}`), "/how-to-order"];
  const entries = [
    ...staticPaths.map((path) => `<url><loc>${SITE_URL}${path}</loc></url>`),
    ...products.map((product) => {
      const date = product.updatedAt && Number.isFinite(Date.parse(product.updatedAt)) ? new Date(product.updatedAt).toISOString() : null;
      return `<url><loc>${escape(`${SITE_URL}${productPath(product.id)}`)}</loc>${date ? `<lastmod>${date}</lastmod>` : ""}</url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
}
