import { env } from "cloudflare:workers";
import {
  DEFAULT_STORE_COVER,
  DEFAULT_STORE_LOGO,
  normalizeProductStatus,
  safeProductImageUrl,
  safeStorefrontAssetUrl,
  type CatalogProduct,
} from "../lib/product-catalog";
import { DEFAULT_STOREFRONT_CONTENT, formatRoundLabel } from "../lib/admin-cms";
import { normalizeRoundProductScope, type RoundProductScope } from "../lib/round-products";
import { safePickupMapUrl } from "../lib/storefront-settings";
import { categoryNamesFromProducts, orderCategoryNames, parseCategoryOrder } from "../lib/category-order";

export type StorefrontRound = {
  id: string;
  deliveryDate: string;
  opensAt: string;
  closesAt: string;
  label: string;
  note: string;
  /** "all" opens every purchasable product; "selected" opens only `productIds`. */
  productScope: RoundProductScope;
  productIds: string[];
};

export type StorefrontData = {
  products: CatalogProduct[];
  categoryOrder: string[];
  rounds: StorefrontRound[];
  nextRound: StorefrontRound | null;
  shippingFee: number | null;
  freeShippingMinimum: number | null;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  promptPayId: string | null;
  promptPayName: string | null;
  content: {
    storeName: string;
    heroTitle: string;
    heroHighlight: string;
    heroDescription: string;
    announcementText: string;
    storyTitle: string;
    storyDescription: string;
    phonePrimary: string;
    phoneSecondary: string;
    storeLogoUrl: string;
    storeCoverUrl: string;
  };
  secureWriteReady: boolean;
};

type RuntimeBindings = { DB?: D1Database; PRODUCT_MEDIA_ORIGIN?: string };
type ProductRow = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  status: string;
  image_url: string;
  category: string;
};
type RoundRow = {
  id: string;
  delivery_date: string;
  opens_at: string;
  closes_at: string;
  status: string;
  label: string;
  note: string;
  product_scope: string;
};
type RoundProductRow = { round_id: string; product_id: string };
type SettingRow = { key: string; value: string; status: string };

export async function getStorefrontData(options: { signal?: AbortSignal } = {}): Promise<StorefrontData> {
  void options;
  return getD1StorefrontData();
}

export async function getD1StorefrontData(now = new Date()): Promise<StorefrontData> {
  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  const [productResult, roundResult, settingResult, roundProductResult] = await bindings.DB.batch([
    bindings.DB.prepare(`SELECT id, name, unit, detail, price, status, image_url, category
      FROM products ORDER BY sort_order`),
    bindings.DB.prepare(`SELECT id, delivery_date, opens_at, closes_at, status, label, note, product_scope
      FROM delivery_rounds ORDER BY delivery_date`),
    bindings.DB.prepare("SELECT key, value, status FROM storefront_settings"),
    bindings.DB.prepare("SELECT round_id, product_id FROM round_products"),
  ]);
  const productRows = productResult.results as unknown as ProductRow[];
  const roundRows = roundResult.results as unknown as RoundRow[];
  const settingRows = settingResult.results as unknown as SettingRow[];
  const roundProductRows = roundProductResult.results as unknown as RoundProductRow[];
  if (productRows.length === 0 || settingRows.length === 0) throw new Error("D1 storefront has not been imported");

  const mediaOrigin = bindings.PRODUCT_MEDIA_ORIGIN ?? "";
  const products = productRows.flatMap((row): CatalogProduct[] => {
    const status = normalizeProductStatus(row.status);
    if (status === "ซ่อนสินค้า") return [];
    const complete = Boolean(row.unit && row.detail && row.price !== null && row.price > 0);
    return [{
      id: row.id,
      name: row.name,
      unit: row.unit || "รอข้อมูลหน่วยขาย",
      detail: row.detail || "รายละเอียดสินค้ารอข้อมูล",
      price: row.price,
      status: status === "เปิดขาย" && !complete ? "รอข้อมูล" : status,
      image: safeProductImageUrl(row.image_url, mediaOrigin),
      category: row.category || "อื่น ๆ",
    }];
  });
  const settings = new Map(settingRows.map((row) => [row.key, row]));
  const activeRounds = roundRows.filter((row) => row.status === "เปิดรับ" && withinWindow(now, row.opens_at, row.closes_at));
  const nextRoundRow = roundRows.find((row) =>
    (row.status === "เตรียมเปิด" || row.status === "เปิดรับ") && now.getTime() < thaiTime(row.opens_at),
  );
  const productIdsByRound = new Map<string, string[]>();
  for (const row of roundProductRows) {
    const existing = productIdsByRound.get(row.round_id);
    if (existing) existing.push(row.product_id);
    else productIdsByRound.set(row.round_id, [row.product_id]);
  }
  const toRound = (row: RoundRow): StorefrontRound => ({
    id: row.id,
    deliveryDate: row.delivery_date,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    label: formatRoundLabel(row.delivery_date),
    note: row.note,
    productScope: normalizeRoundProductScope(row.product_scope),
    productIds: productIdsByRound.get(row.id) ?? [],
  });
  const value = (key: string) => settings.get(key)?.value ?? "";
  const readyValue = (key: string) => settings.get(key)?.status === "พร้อมใช้" ? value(key) : "";
  const shippingFee = readyValue("postal_shipping_fee") === "" ? null : Number(readyValue("postal_shipping_fee"));
  const freeShippingMinimum = readyValue("free_shipping_minimum") === "" ? null : Number(readyValue("free_shipping_minimum"));
  const categoryOrder = orderCategoryNames(categoryNamesFromProducts(products), parseCategoryOrder(value("category_order")));

  return {
    products,
    categoryOrder,
    rounds: activeRounds.map(toRound),
    nextRound: nextRoundRow ? toRound(nextRoundRow) : null,
    shippingFee: Number.isFinite(shippingFee) ? shippingFee : null,
    freeShippingMinimum: freeShippingMinimum !== null && Number.isFinite(freeShippingMinimum) && freeShippingMinimum > 0 ? freeShippingMinimum : null,
    pickupAddress: readyValue("pickup_address") || null,
    pickupMapUrl: safePickupMapUrl(readyValue("pickup_map_url")),
    promptPayId: value("promptpay_id") || null,
    promptPayName: value("promptpay_name") || null,
    content: {
      storeName: value("store_name") || "เจ๊น้อย เขียงหมูตะคร้อ",
      heroTitle: value("hero_title") || DEFAULT_STOREFRONT_CONTENT.heroTitle,
      heroHighlight: value("hero_highlight") || DEFAULT_STOREFRONT_CONTENT.heroHighlight,
      heroDescription: value("hero_description") || DEFAULT_STOREFRONT_CONTENT.heroDescription,
      announcementText: value("announcement_text") || DEFAULT_STOREFRONT_CONTENT.announcementText,
      storyTitle: value("story_title") || DEFAULT_STOREFRONT_CONTENT.storyTitle,
      storyDescription: value("story_description") || DEFAULT_STOREFRONT_CONTENT.storyDescription,
      phonePrimary: value("phone_primary") || "087-2416773",
      phoneSecondary: value("phone_secondary") || "087-8755479",
      storeLogoUrl: safeStorefrontAssetUrl(value("store_logo_url"), DEFAULT_STORE_LOGO, mediaOrigin),
      storeCoverUrl: safeStorefrontAssetUrl(value("store_cover_url"), DEFAULT_STORE_COVER, mediaOrigin),
    },
    secureWriteReady: true,
  };
}

function withinWindow(now: Date, opensAt: string, closesAt: string): boolean {
  const time = now.getTime();
  return time >= thaiTime(opensAt) && time <= thaiTime(closesAt);
}

function thaiTime(value: string): number {
  return Date.parse(`${value}:00+07:00`);
}
