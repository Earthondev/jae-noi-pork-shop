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
  "ของฝากนครราชสีมา",
  "สั่งแหนมออนไลน์",
  "แหนมหมูส่งไปรษณีย์",
  "พรีออเดอร์แหนมหมู",
] as const;

export const SITE_TITLE = "แหนมหมู ไส้กรอกอีสาน แคปหมู | เจ๊น้อย เขียงหมูตะคร้อ บัวใหญ่";

// Long enough for Google to show in full (~155 chars) and specific enough that
// an assistant answering "ซื้อแหนมหมูที่ไหน" has the product, the place, and
// the way to buy in one sentence.
export const SITE_DESCRIPTION =
  "สั่งแหนมหมู ไส้กรอกอีสาน แคปหมู และกากหมูโบราณ ทำสดใหม่ทุกวันจากร้านเจ๊น้อย เขียงหมูตะคร้อ อ.บัวใหญ่ จ.นครราชสีมา สั่งออนไลน์ แพ็กสูญญากาศ ส่งไปรษณีย์ทั่วไทย";

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
    makesOffer: [
      offer("แหนมหมู", "แหนมหมูสูตรดั้งเดิม ทำสดใหม่ แพ็กสูญญากาศ"),
      offer("ไส้กรอกอีสาน", "ไส้กรอกอีสานรสเปรี้ยวกำลังดี ย่างทานร้อน ๆ"),
      offer("แคปหมู", "แคปหมูติดมัน กรอบ ไม่เหม็นหืน"),
      offer("กากหมูโบราณ", "กากหมูเจียวสูตรโบราณ หอมกรอบ"),
    ],
  });
}

function offer(name: string, description: string) {
  return {
    "@type": "Offer",
    itemOffered: { "@type": "Product", name, description, category: "อาหารแปรรูปจากหมู" },
    availability: "https://schema.org/PreOrder",
    priceCurrency: "THB",
  };
}
