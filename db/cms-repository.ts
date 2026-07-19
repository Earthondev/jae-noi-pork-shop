import { env } from "cloudflare:workers";
import {
  cleanStorefrontSettings,
  AdminCmsValidationError,
  DEFAULT_STOREFRONT_CONTENT,
  roundIdFromDeliveryDate,
  formatRoundLabel,
  validateProductInput,
  validateRoundInput,
  type AdminCmsData,
  type AdminProduct,
  type AdminRound,
  type AdminStorefrontSettings,
  type ProductInput,
  type RoundInput,
} from "../lib/admin-cms";
import { PRODUCT_IMAGE_PLACEHOLDER, safeProductImageUrl } from "../lib/product-catalog";

type RuntimeBindings = { DB?: D1Database; PRODUCT_MEDIA_ORIGIN?: string };
export type CmsMutationResult = "updated" | "not_found" | "conflict" | "duplicate";
type ProductRow = Omit<AdminProduct, "imageUrl" | "updatedAt" | "fingerprint"> & { image_url: string; updated_at: string; sort_order: number; version: number };
type RoundRow = { id: string; delivery_date: string; opens_at: string; closes_at: string; status: AdminRound["status"]; label: string; note: string; version: number };
type SettingRow = { key: string; value: string; version: number };

function bindings(): { db: D1Database; mediaOrigin: string } {
  const value = env as unknown as RuntimeBindings;
  if (!value.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return { db: value.DB, mediaOrigin: value.PRODUCT_MEDIA_ORIGIN ?? "" };
}

export async function getAdminCmsData(): Promise<AdminCmsData> {
  const { db } = bindings();
  const [productsResult, roundsResult, settingsResult, totalsResult] = await db.batch([
    db.prepare("SELECT id,name,unit,detail,price,status,image_url,category,sort_order,version,updated_at FROM products ORDER BY sort_order"),
    db.prepare("SELECT id,delivery_date,opens_at,closes_at,status,label,note,version FROM delivery_rounds ORDER BY delivery_date"),
    db.prepare("SELECT key,value,version FROM storefront_settings"),
    db.prepare(`SELECT round_id,
      COUNT(*) AS order_count,
      SUM(CASE WHEN payment_status='paid' AND order_status!='cancelled' THEN 1 ELSE 0 END) AS paid_order_count,
      COALESCE(SUM(CASE WHEN payment_status='paid' AND order_status!='cancelled' THEN total ELSE 0 END),0) AS sales
      FROM orders GROUP BY round_id`),
  ]);
  const totals = new Map((totalsResult.results as Array<{ round_id: string; order_count: number; paid_order_count: number; sales: number }>).map((row) => [row.round_id, row]));
  const products = (productsResult.results as unknown as ProductRow[]).map((row) => ({
    id: row.id, name: row.name, unit: row.unit, detail: row.detail, price: row.price, status: row.status,
    imageUrl: row.image_url, category: row.category, updatedAt: row.updated_at, fingerprint: String(row.version),
  }));
  const rounds = (roundsResult.results as unknown as RoundRow[]).map((row) => {
    const total = totals.get(row.id);
    return {
      id: row.id, deliveryDate: row.delivery_date, opensAt: row.opens_at, closesAt: row.closes_at,
      status: row.status, label: formatRoundLabel(row.delivery_date), note: row.note, orderCount: total?.order_count ?? 0,
      paidOrderCount: total?.paid_order_count ?? 0,
      sales: total?.sales ?? 0, displayState: displayState(row), fingerprint: String(row.version),
    };
  });
  const settingRows = settingsResult.results as unknown as SettingRow[];
  const settingMap = new Map(settingRows.map((row) => [row.key, row.value]));
  const value = (key: string, fallback = "") => settingMap.get(key) || fallback;
  const fee = settingMap.get("postal_shipping_fee");
  const settings: AdminStorefrontSettings = {
    storeName: value("store_name", "เจ๊น้อย เขียงหมูตะคร้อ"),
    heroTitle: value("hero_title", DEFAULT_STOREFRONT_CONTENT.heroTitle),
    heroHighlight: value("hero_highlight", DEFAULT_STOREFRONT_CONTENT.heroHighlight),
    heroDescription: value("hero_description", DEFAULT_STOREFRONT_CONTENT.heroDescription),
    announcementText: value("announcement_text", DEFAULT_STOREFRONT_CONTENT.announcementText),
    storyTitle: value("story_title", DEFAULT_STOREFRONT_CONTENT.storyTitle),
    storyDescription: value("story_description", DEFAULT_STOREFRONT_CONTENT.storyDescription),
    phonePrimary: value("phone_primary", "087-2416773"), phoneSecondary: value("phone_secondary", "087-8755479"),
    shippingFee: fee === undefined || fee === "" ? null : Number(fee), pickupAddress: value("pickup_address"),
    pickupMapUrl: value("pickup_map_url"), storeLogoUrl: value("store_logo_url"), storeCoverUrl: value("store_cover_url"),
    fingerprint: settingsFingerprint(settingRows),
  };
  return { products, rounds, settings, refreshedAt: new Date().toISOString() };
}

export async function createAdminProduct(input: ProductInput): Promise<CmsMutationResult> {
  const product = validateProductInput(input); assertProductImage(product.imageUrl);
  const { db } = bindings();
  if (await db.prepare("SELECT 1 FROM products WHERE id=?").bind(product.id).first()) return "duplicate";
  const next = await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS value FROM products").first<{ value: number }>();
  await db.prepare(`INSERT INTO products (id,name,unit,detail,price,status,image_url,category,sort_order,version,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?)`).bind(product.id, product.name, product.unit, product.detail, product.price, product.status, product.imageUrl, product.category, next?.value ?? 1, new Date().toISOString()).run();
  return "updated";
}

export async function updateAdminProduct(id: string, input: ProductInput): Promise<CmsMutationResult> {
  const product = validateProductInput({ ...input, id }); assertProductImage(product.imageUrl);
  const { db } = bindings();
  const current = await db.prepare("SELECT version FROM products WHERE id=?").bind(id).first<{ version: number }>();
  if (!current) return "not_found";
  if (input.fingerprint && input.fingerprint !== String(current.version)) return "conflict";
  await db.prepare(`UPDATE products SET name=?,unit=?,detail=?,price=?,status=?,image_url=?,category=?,version=version+1,updated_at=? WHERE id=? AND version=?`)
    .bind(product.name, product.unit, product.detail, product.price, product.status, product.imageUrl, product.category, new Date().toISOString(), id, current.version).run();
  return "updated";
}

export async function moveAdminProduct(id: string, direction: "up" | "down", expectedFingerprint?: string): Promise<CmsMutationResult> {
  const { db } = bindings();
  const current = await db.prepare("SELECT sort_order,version FROM products WHERE id=?").bind(id).first<{ sort_order: number; version: number }>();
  if (!current) return "not_found";
  if (expectedFingerprint && expectedFingerprint !== String(current.version)) return "conflict";
  const operator = direction === "up" ? "<" : ">"; const order = direction === "up" ? "DESC" : "ASC";
  const target = await db.prepare(`SELECT id,sort_order FROM products WHERE sort_order ${operator} ? ORDER BY sort_order ${order} LIMIT 1`)
    .bind(current.sort_order).first<{ id: string; sort_order: number }>();
  if (!target) return "updated";
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE products SET sort_order=-1,version=version+1,updated_at=? WHERE id=?").bind(now, id),
    db.prepare("UPDATE products SET sort_order=?,version=version+1,updated_at=? WHERE id=?").bind(current.sort_order, now, target.id),
    db.prepare("UPDATE products SET sort_order=?,updated_at=? WHERE id=?").bind(target.sort_order, now, id),
  ]);
  return "updated";
}

export async function createAdminRound(input: RoundInput): Promise<CmsMutationResult> {
  const round = validateRoundInput(input); const id = roundIdFromDeliveryDate(round.deliveryDate); const { db } = bindings();
  if (await db.prepare("SELECT 1 FROM delivery_rounds WHERE id=? OR delivery_date=?").bind(id, round.deliveryDate).first()) return "duplicate";
  await db.prepare(`INSERT INTO delivery_rounds (id,delivery_date,opens_at,closes_at,status,label,note,version,updated_at) VALUES (?,?,?,?,?,?,?,1,?)`)
    .bind(id, round.deliveryDate, round.opensAt, round.closesAt, round.status, formatRoundLabel(round.deliveryDate), round.note, new Date().toISOString()).run();
  return "updated";
}

export async function updateAdminRound(id: string, input: RoundInput): Promise<CmsMutationResult> {
  const round = validateRoundInput(input); if (roundIdFromDeliveryDate(round.deliveryDate) !== id) throw new AdminCmsValidationError("ไม่สามารถเปลี่ยนวันจัดส่งของรอบเดิมได้ กรุณาสร้างรอบใหม่");
  const { db } = bindings(); const current = await db.prepare("SELECT version FROM delivery_rounds WHERE id=?").bind(id).first<{ version: number }>();
  if (!current) return "not_found"; if (input.fingerprint && input.fingerprint !== String(current.version)) return "conflict";
  await db.prepare("UPDATE delivery_rounds SET opens_at=?,closes_at=?,status=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=?")
    .bind(round.opensAt, round.closesAt, round.status, round.note, new Date().toISOString(), id, current.version).run();
  return "updated";
}

export async function updateAdminStorefrontSettings(input: Omit<AdminStorefrontSettings, "fingerprint"> & { fingerprint?: string }): Promise<CmsMutationResult> {
  const { db } = bindings(); const rows = await db.prepare("SELECT key,version FROM storefront_settings").all<{ key: string; version: number }>();
  if (input.fingerprint && input.fingerprint !== settingsFingerprint(rows.results.map((row) => ({ ...row, value: "" })))) return "conflict";
  const settings = cleanStorefrontSettings(input); const now = new Date().toISOString();
  const values: Record<string, string> = {
    store_name: settings.storeName, hero_title: settings.heroTitle, hero_highlight: settings.heroHighlight,
    hero_description: settings.heroDescription, announcement_text: settings.announcementText, story_title: settings.storyTitle,
    story_description: settings.storyDescription, phone_primary: settings.phonePrimary, phone_secondary: settings.phoneSecondary,
    postal_shipping_fee: settings.shippingFee === null ? "" : String(settings.shippingFee), pickup_address: settings.pickupAddress,
    pickup_map_url: settings.pickupMapUrl, store_logo_url: settings.storeLogoUrl, store_cover_url: settings.storeCoverUrl,
  };
  await db.batch(Object.entries(values).map(([key, value]) => db.prepare(`INSERT INTO storefront_settings (key,value,purpose,status,version,updated_at)
    VALUES (?,?,'','พร้อมใช้',1,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=version+1,updated_at=excluded.updated_at`).bind(key, value, now)));
  return "updated";
}

function settingsFingerprint(rows: Array<{ key: string; version: number }>): string { return rows.map((row) => `${row.key}:${row.version}`).sort().join("|"); }
function displayState(row: RoundRow): string {
  const now = Date.now(), opens = Date.parse(`${row.opens_at}:00+07:00`), closes = Date.parse(`${row.closes_at}:00+07:00`);
  if (row.status === "เตรียมเปิด") return "ยังไม่แสดง"; if (row.status !== "เปิดรับ" || now > closes) return "ปิดรับแล้ว";
  return now < opens ? "ยังไม่ถึงเวลาเปิด" : "แสดงใน dropdown";
}
function assertProductImage(url: string): void {
  if (!url) return; const { mediaOrigin } = bindings();
  const urls = url.split(",");
  for (const u of urls) {
    if (safeProductImageUrl(u.trim(), mediaOrigin) === PRODUCT_IMAGE_PLACEHOLDER) throw new AdminCmsValidationError("รูปสินค้าต้องมาจากพื้นที่รูปของร้านเท่านั้น");
  }
}
