import type { StorefrontData } from "../db/storefront-repository";

// One place for the facts search engines and AI assistants quote back about
// the shop. Kept out of the layout so the values can be asserted in tests
// rather than reviewed by eye inside JSX.

export const SITE_URL = "https://jaenoishop.com";

export const SHOP = {
  name: "เจ๊น้อย เขียงหมูตะคร้อ",
  legalName: "ร้านเจ๊น้อย เขียงหมูตะคร้อ",
  street: "ถนนนิเวศรัตน์",
  subdistrict: "ต.บัวใหญ่",
  district: "อ.บัวใหญ่",
  province: "จ.นครราชสีมา",
  postalCode: "30120",
  phonePrimary: "087-2416773",
  phoneSecondary: "061-0935329",
} as const;

/** What a customer would actually type into Google or ask an assistant. */
export const KEYWORDS = [
  "แหนมหมู",
  "แหนมหมูสามชั้น",
  "ไส้กรอกอีสาน",
  "แคปหมู",
  "กากหมูโบราณ",
  "เจ๊น้อย เขียงหมูตะคร้อ",
  "เขียงหมูตะคร้อ",
  "แหนมหมูบัวใหญ่",
  "แหนมหมูโคราช",
  "ของฝากนครราชสีมา",
  "แหนมหมูออนไลน์",
  "แคปหมูออนไลน์",
  "ไส้กรอกอีสานออนไลน์",
  "แหนมหมูส่งไปรษณีย์",
  "พรีออเดอร์แหนมหมู",
] as const;

export const SITE_TITLE = "แหนมหมู ไส้กรอกอีสาน แคปหมู | เจ๊น้อย เขียงหมูตะคร้อ บัวใหญ่";

// Describe the catalogue and location without promising current availability.
// Google may choose different snippet text based on the query.
export const SITE_DESCRIPTION =
  "เจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา รวมแหนมหมู ไส้กรอกอีสาน กากหมูและหม่ำหมู ดูราคา รูปสินค้า ขนาดบรรจุ ค่าจัดส่ง และรอบขายล่าสุด";

export function fullAddress(): string {
  return `${SHOP.legalName} ${SHOP.street} ${SHOP.subdistrict} ${SHOP.district} ${SHOP.province} ${SHOP.postalCode}`;
}

/**
 * The shop's presence elsewhere. Assistants and Google's Knowledge Panel merge
 * a business's identity across these URLs, so an entry here is worth more than
 * any wording change on the page itself. Empty strings are dropped rather than
 * emitted, because a `sameAs` pointing nowhere is worse than no `sameAs`.
 */
export const SHOP_LINKS = {
  // The shop's own place on Google Maps — the same link the storefront's
  // "เปิดแผนที่ / นำทาง" button uses (`pickup_map_url` in storefront_settings).
  // Keep the two identical: this is what ties the website to the Google
  // Business Profile, and a second, different pin reads as a second business.
  googleMaps: "https://maps.app.goo.gl/C7sFuXvWZZeHuL1u8?g_st=ic",
  // Business profile shared by the shop owner.
  googleBusinessProfile: "https://share.google/xImLwlrVykUpT5klZ",
  // The shop's own Facebook *Page*, once it has one. The profile recorded so
  // far belongs to the owner personally and is a contact link, not the
  // business, so it does not belong in `sameAs`.
  facebook: "",
} as const;

function sameAsLinks(): string[] {
  return Object.values(SHOP_LINKS).filter((link) => link.length > 0);
}

/** Editorial guides are not saleable catalogue entries. Prices live only in D1. */
export const PRODUCT_GUIDES = [
  { slug: "naem-moo", name: "แหนมหมู", image: "/images/products/jae-noi-holding-two-naem-pork-bags.jpg" },
  { slug: "sai-krok-isan", name: "ไส้กรอกอีสาน", image: "/images/products/jae-noi-presenting-vacuum-packed-pork-sausages.jpg" },
  { slug: "kaep-moo", name: "กากหมูโบราณ", image: "/images/products/jae-noi-presenting-pork-rinds-large-tubs.jpg" },
] as const;

export function productGuide(slug: string) {
  const guide = PRODUCT_GUIDES.find((entry) => entry.slug === slug);
  if (!guide) throw new Error(`Unknown product guide: ${slug}`);
  return guide;
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function breadcrumbs(name: string, url: string) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "เมนูสินค้า", item: `${SITE_URL}/products` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  };
}

export function guideJsonLd(slug: string, name?: string): string {
  const guide = productGuide(slug);
  return jsonLd({ "@context": "https://schema.org", ...breadcrumbs(name ?? guide.name, `${SITE_URL}/products/${slug}`) });
}

/**
 * Schema.org description of the shop. Assistants lift name, address, phone and
 * opening model straight out of this, so it repeats what the page says rather
 * than claiming anything the storefront does not.
 */
export function shopJsonLd(storefront?: StorefrontData | null): string {
  const map = storefront ? storefront.pickupMapUrl : SHOP_LINKS.googleMaps;
  const sameAs = [...sameAsLinks().filter((url) => url !== SHOP_LINKS.googleMaps), ...(map ? [map] : [])];
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/#store`,
    name: storefront?.content.storeName ?? SHOP.name,
    legalName: SHOP.legalName,
    url: SITE_URL,
    image: `${SITE_URL}/og.png`,
    // Organization/LocalBusiness logo — Google's Merchant and Knowledge Panel
    // surfaces read this field specifically, separately from `image` above.
    logo: new URL(storefront?.content.storeLogoUrl ?? "/images/products/jae-noi-shop-logo.jpg", SITE_URL).href,
    description: SITE_DESCRIPTION,
    telephone: storefront?.content.phonePrimary ?? SHOP.phonePrimary,
    priceRange: "฿฿",
    currenciesAccepted: "THB",
    paymentAccepted: "PromptPay, โอนเงินผ่านธนาคาร",
    servesCuisine: ["อาหารอีสาน", "อาหารแปรรูปจากหมู"],
    // What the shop is an authority *on*, in the words customers ask in. This
    // is the field an assistant reads when deciding whether this entity is a
    // sensible answer to "ซื้อแหนมหมูบัวใหญ่ที่ไหน" at all.
    knowsAbout: ["แหนมหมู", "ไส้กรอกอีสาน", "แคปหมูติดมัน", "กากหมูโบราณ", "ของฝากนครราชสีมา"],
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(map ? { hasMap: map } : {}),
    // Orders run in pre-order rounds rather than fixed shop hours, so the shop
    // does not claim opening hours it cannot keep. `areaServed` carries both
    // the nationwide postal service and the towns people actually search with.
    areaServed: [
      { "@type": "Country", name: "ประเทศไทย" },
      { "@type": "AdministrativeArea", name: "จังหวัดนครราชสีมา" },
      { "@type": "City", name: "อำเภอบัวใหญ่" },
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: SHOP.street,
      addressLocality: SHOP.district,
      addressRegion: SHOP.province,
      postalCode: SHOP.postalCode,
      addressCountry: "TH",
    },
    contactPoint: [
      { "@type": "ContactPoint", telephone: storefront?.content.phonePrimary ?? SHOP.phonePrimary, contactType: "sales", availableLanguage: "Thai" },
      { "@type": "ContactPoint", telephone: storefront?.content.phoneSecondary ?? SHOP.phoneSecondary, contactType: "customer service", availableLanguage: "Thai" },
    ],
  });
}
