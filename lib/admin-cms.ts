import type { ProductStatus } from "./product-catalog";
import { safeStorefrontAssetUrl } from "./product-catalog";
import { safePickupMapUrl } from "./storefront-settings";

export const PRODUCT_STATUSES: readonly ProductStatus[] = ["เปิดขาย", "ปิดชั่วคราว", "รอข้อมูล", "ซ่อนสินค้า"];
export const ROUND_STATUSES = ["เตรียมเปิด", "เปิดรับ", "ปิดรับ", "จัดส่งแล้ว", "ยกเลิก"] as const;

export type RoundStatus = (typeof ROUND_STATUSES)[number];

export type AdminProduct = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  status: ProductStatus;
  imageUrl: string;
  category: string;
  updatedAt: string;
  fingerprint: string;
};

export type AdminRound = {
  id: string;
  deliveryDate: string;
  opensAt: string;
  closesAt: string;
  status: RoundStatus;
  label: string;
  note: string;
  orderCount: number;
  sales: number;
  displayState: string;
  fingerprint: string;
};

export type AdminStorefrontSettings = {
  storeName: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  announcementText: string;
  storyTitle: string;
  storyDescription: string;
  phonePrimary: string;
  phoneSecondary: string;
  shippingFee: number | null;
  pickupAddress: string;
  pickupMapUrl: string;
  storeLogoUrl: string;
  storeCoverUrl: string;
  fingerprint: string;
};

export type AdminCmsData = {
  products: AdminProduct[];
  rounds: AdminRound[];
  settings: AdminStorefrontSettings;
  refreshedAt: string;
};

export type ProductInput = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  status: ProductStatus;
  imageUrl: string;
  category: string;
  fingerprint?: string;
};

export type RoundInput = {
  deliveryDate: string;
  opensAt: string;
  closesAt: string;
  status: RoundStatus;
  note: string;
  fingerprint?: string;
};

export const DEFAULT_STOREFRONT_CONTENT = {
  heroTitle: "อร่อยถึงเครื่อง",
  heroHighlight: "สั่งง่ายถึงบ้าน",
  heroDescription: "แหนมหมู ไส้กรอกอีสาน และแคปหมูสูตรร้านเจ๊น้อย เลือกของอร่อย ใส่ตะกร้า แล้วสั่งได้เลย",
  announcementText: "ทำสดทุกวัน ◆ สูตรดั้งเดิมตะคร้อ ◆ แพ็กพร้อมส่ง ◆ อร่อยถึงเครื่อง",
  storyTitle: "ของดีจากเขียงหมูตะคร้อ",
  storyDescription: "รสชาติคุ้นเคยจากร้านท้องถิ่น ส่งต่อด้วยวัตถุดิบที่คัดแล้วและความตั้งใจในทุกแพ็ก จากมือเจ๊น้อยถึงมือลูกค้า",
} as const;

export function normalizeProductId(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

export function roundIdFromDeliveryDate(deliveryDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) throw new Error("วันจัดส่งไม่ถูกต้อง");
  return `RD-${deliveryDate.replaceAll("-", "")}`;
}

export function validateProductInput(input: ProductInput): ProductInput {
  const id = normalizeProductId(input.id);
  const name = cleanText(input.name, 100);
  const unit = cleanText(input.unit, 80);
  const detail = cleanText(input.detail, 500);
  const imageUrl = input.imageUrl.trim().slice(0, 2500);
  const category = cleanText(input.category, 80) || "อื่น ๆ";
  if (!/^[A-Z0-9_-]{2,40}$/.test(id)) throw new Error("รหัสสินค้าต้องมี 2-40 ตัว ใช้อักษรอังกฤษ ตัวเลข - หรือ _");
  if (!name) throw new Error("กรุณากรอกชื่อสินค้า");
  if (!PRODUCT_STATUSES.includes(input.status)) throw new Error("สถานะสินค้าไม่ถูกต้อง");
  const price = input.price === null ? null : Number(input.price);
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 1_000_000)) throw new Error("ราคาสินค้าไม่ถูกต้อง");
  if (input.status === "เปิดขาย" && (!unit || !detail || price === null)) throw new Error("สินค้าที่เปิดขายต้องมีหน่วย รายละเอียด และราคาให้ครบ");
  return { ...input, id, name, unit, detail, price, imageUrl, category };
}

export function validateRoundInput(input: RoundInput): RoundInput {
  if (!isDateInput(input.deliveryDate)) throw new Error("วันจัดส่งไม่ถูกต้อง");
  if (!isDateTimeInput(input.opensAt) || !isDateTimeInput(input.closesAt)) throw new Error("วันเวลาเปิดหรือปิดรับไม่ถูกต้อง");
  if (!ROUND_STATUSES.includes(input.status)) throw new Error("สถานะรอบไม่ถูกต้อง");
  const opensAt = localInputMs(input.opensAt);
  const closesAt = localInputMs(input.closesAt);
  const deliveryAt = localInputMs(`${input.deliveryDate}T23:59`);
  if (opensAt >= closesAt) throw new Error("เวลาเปิดรับต้องมาก่อนเวลาปิดรับ");
  if (closesAt > deliveryAt) throw new Error("เวลาปิดรับต้องไม่เกินวันจัดส่ง");
  return { ...input, note: cleanText(input.note, 500) };
}

export function cleanStorefrontSettings(input: Omit<AdminStorefrontSettings, "fingerprint">): Omit<AdminStorefrontSettings, "fingerprint"> {
  const shippingFee = input.shippingFee === null ? null : Number(input.shippingFee);
  if (shippingFee !== null && (!Number.isFinite(shippingFee) || shippingFee < 0 || shippingFee > 100_000)) {
    throw new Error("ค่าส่งไม่ถูกต้อง");
  }
  const pickupMapUrl = input.pickupMapUrl.trim().slice(0, 500);
  if (pickupMapUrl && !safePickupMapUrl(pickupMapUrl)) throw new Error("ลิงก์แผนที่ต้องเป็น Google Maps แบบ HTTPS");
  const storeLogoUrl = input.storeLogoUrl.trim().slice(0, 500);
  const storeCoverUrl = input.storeCoverUrl.trim().slice(0, 500);
  if (storeLogoUrl && safeStorefrontAssetUrl(storeLogoUrl, "") === "") throw new Error("โลโก้ต้องมาจากพื้นที่รูปของร้านเท่านั้น");
  if (storeCoverUrl && safeStorefrontAssetUrl(storeCoverUrl, "") === "") throw new Error("ภาพปกต้องมาจากพื้นที่รูปของร้านเท่านั้น");
  return {
    storeName: requiredText(input.storeName, 100, "ชื่อร้าน"),
    heroTitle: requiredText(input.heroTitle, 100, "หัวข้อหน้าร้าน"),
    heroHighlight: requiredText(input.heroHighlight, 100, "ข้อความเน้นหน้าร้าน"),
    heroDescription: requiredText(input.heroDescription, 500, "คำแนะนำร้าน"),
    announcementText: requiredText(input.announcementText, 300, "ข้อความประกาศ"),
    storyTitle: requiredText(input.storyTitle, 120, "หัวข้อเรื่องของร้าน"),
    storyDescription: requiredText(input.storyDescription, 1_000, "เรื่องของร้าน"),
    phonePrimary: normalizePhone(input.phonePrimary),
    phoneSecondary: normalizePhone(input.phoneSecondary),
    shippingFee,
    pickupAddress: cleanText(input.pickupAddress, 500),
    pickupMapUrl,
    storeLogoUrl,
    storeCoverUrl,
  };
}

export function sheetsSerialFromInput(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) throw new Error("รูปแบบวันเวลาไม่ถูกต้อง");
  const [, year, month, day, hour = "0", minute = "0"] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) / 86_400_000 + 25_569;
}

export function dateInputFromSheetsSerial(value: unknown): string {
  return inputFromSerial(value, false);
}

export function dateTimeInputFromSheetsSerial(value: unknown): string {
  return inputFromSerial(value, true);
}

export async function fingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

function inputFromSerial(value: unknown, includeTime: boolean): string {
  const serial = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(serial)) return "";
  const date = new Date((serial - 25_569) * 86_400_000);
  const datePart = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return includeTime ? `${datePart}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}` : datePart;
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function requiredText(value: string, maxLength: number, label: string): string {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned) throw new Error(`กรุณากรอก${label}`);
  return cleaned;
}

function normalizePhone(value: string): string {
  const phone = value.trim().replace(/[^0-9+ -]/g, "").slice(0, 30);
  if (phone.replace(/\D/g, "").length < 9) throw new Error("เบอร์โทรไม่ถูกต้อง");
  return phone;
}

function isDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(localInputMs(`${value}T00:00`));
}

function isDateTimeInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(localInputMs(value));
}

function localInputMs(value: string): number {
  return Date.parse(`${value}:00+07:00`);
}
