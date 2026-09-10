export const PRODUCT_CONTENT_FIELDS = [
  ["careNote", "คำแนะนำสำคัญเมื่อได้รับสินค้า"],
  ["ingredients", "ส่วนประกอบสำคัญ"],
  ["allergens", "ข้อมูลสารก่อภูมิแพ้"],
  ["storage", "วิธีเก็บรักษา"],
  ["cooking", "วิธีปรุงให้สุก"],
  ["serving", "เมนูที่ทำได้"],
  ["shipping", "บรรจุภัณฑ์และการจัดส่ง"],
  ["faq", "คำถามที่พบบ่อย"],
] as const;
export type ProductContent = Partial<Record<(typeof PRODUCT_CONTENT_FIELDS)[number][0], string>>;

// Add only shop-confirmed guidance, keyed by the product's stable admin ID.
// Prices, names, units and photos continue to come from the existing CMS.
const PRODUCT_CONTENT: Readonly<Record<string, ProductContent>> = {};

export function getProductContent(productId: string): ProductContent {
  return PRODUCT_CONTENT[productId] ?? {};
}
