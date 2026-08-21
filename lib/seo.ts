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

export const SITE_TITLE = "แหนมหมู ไส้กรอกอีสาน กากหมูโบราณ (แคปหมูติดมัน) | เจ๊น้อย บัวใหญ่";

// Long enough for Google to show in full (~155 chars) and specific enough that
// an assistant answering "ซื้อแหนมหมูที่ไหน" has the product, the place, and
// the way to buy in one sentence.
export const SITE_DESCRIPTION =
  "สั่งแหนมหมู ไส้กรอกอีสาน และกากหมูโบราณ (แคปหมูติดมัน) จากเจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา ทำสด แพ็กสูญญากาศ ส่งไปรษณีย์ทั่วไทย";

export function fullAddress(): string {
  return `${SHOP.legalName} ${SHOP.street} ${SHOP.subdistrict} ${SHOP.district} ${SHOP.province} ${SHOP.postalCode}`;
}

/**
 * Schema.org description of the shop. Assistants lift name, address, phone and
 * opening model straight out of this, so it repeats what the page says rather
 * than claiming anything the storefront does not.
 */
export function shopJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/#store`,
    name: SHOP.name,
    legalName: SHOP.legalName,
    url: SITE_URL,
    image: `${SITE_URL}/og.png`,
    description: SITE_DESCRIPTION,
    telephone: SHOP.phonePrimary,
    priceRange: "฿฿",
    currenciesAccepted: "THB",
    paymentAccepted: "PromptPay, โอนเงินผ่านธนาคาร",
    servesCuisine: ["อาหารอีสาน", "อาหารแปรรูปจากหมู"],
    areaServed: { "@type": "Country", name: "ประเทศไทย" },
    address: {
      "@type": "PostalAddress",
      streetAddress: SHOP.street,
      addressLocality: SHOP.district,
      addressRegion: SHOP.province,
      postalCode: SHOP.postalCode,
      addressCountry: "TH",
    },
    contactPoint: [
      { "@type": "ContactPoint", telephone: SHOP.phonePrimary, contactType: "sales", availableLanguage: "Thai" },
      { "@type": "ContactPoint", telephone: SHOP.phoneSecondary, contactType: "customer service", availableLanguage: "Thai" },
    ],
    // Prices are snapshots of the admin catalogue, not a live read of it (this
    // file has no D1 access — see the module comment). Google flags a mismatch
    // between structured data and the page price as a Merchant error, so keep
    // these in sync by hand whenever a price changes in Admin > สินค้า.
    makesOffer: [
      offer("แหนมหมู", "แหนมหมูสูตรดั้งเดิม ทำสดใหม่ แพ็กสูญญากาศ", 130),
      offer("ไส้กรอกอีสาน", "ไส้กรอกอีสานรสเปรี้ยวกำลังดี ย่างทานร้อน ๆ", 100),
      // "แคปหมู" is the name customers search for; "กากหมูโบราณ" is the same
      // product's name in the admin catalogue. One Product, not two, or Google
      // sees two listings for a store that only sells one of them.
      offer("กากหมูโบราณ", "กากหมูเจียวสูตรโบราณ หอมกรอบ", 185, "แคปหมู"),
    ],
  });
}

function offer(name: string, description: string, price: number, alternateName?: string) {
  return {
    "@type": "Offer",
    // Google's Product rich-result validator requires offers/review/aggregateRating
    // on the Product node itself, not only on the Offer wrapping it — a Product
    // with no offers of its own is reported invalid even though an Offer refers to it.
    itemOffered: {
      "@type": "Product",
      name,
      description,
      category: "อาหารแปรรูปจากหมู",
      ...(alternateName ? { alternateName } : {}),
      offers: { "@type": "Offer", priceCurrency: "THB", price, availability: "https://schema.org/PreOrder" },
    },
    availability: "https://schema.org/PreOrder",
    priceCurrency: "THB",
    price,
  };
}
