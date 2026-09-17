import type { CatalogProduct } from "./product-catalog";

export type GuideSlug = "naem-moo" | "sai-krok-isan" | "kaep-moo";

// Editorial associations stay in code. A renamed/reused SKU must still match
// the subject; never infer recipes or equivalence between these products.
const associations: Record<GuideSlug, { ids: readonly string[]; name: RegExp }> = {
  "naem-moo": { ids: ["NAEM250"], name: /แหนม/ },
  "sai-krok-isan": { ids: ["SAUSAGE10"], name: /ไส้กรอก/ },
  "kaep-moo": { ids: ["PORKRIND1", "P0006", "P0007"], name: /กากหมู|แค[ปบ]หมู/ },
};

export function productsForGuide(slug: GuideSlug, products: readonly CatalogProduct[]) {
  const association = associations[slug];
  return products.filter((product) => association.ids.includes(product.id)
    && association.name.test(product.name)
    && ["เปิดขาย", "ปิดชั่วคราว", "รอข้อมูล"].includes(product.status));
}
