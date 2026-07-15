export const DEFAULT_PRODUCT_MEDIA_ORIGIN = "https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev";
export const PRODUCT_IMAGE_PLACEHOLDER = "/images/products/product-placeholder.svg";
export const DEFAULT_STORE_LOGO = "/images/products/jae-noi-shop-logo.jpg";
export const DEFAULT_STORE_COVER = "/images/products/jae-noi-holding-two-naem-pork-bags.jpg";

export type ProductStatus = "เปิดขาย" | "ปิดชั่วคราว" | "รอข้อมูล" | "ซ่อนสินค้า";
export type VisibleProductStatus = Exclude<ProductStatus, "ซ่อนสินค้า">;

export type CatalogProduct = {
  id: string;
  name: string;
  unit: string;
  detail: string;
  price: number | null;
  status: VisibleProductStatus;
  image: string;
  category: string;
};

export function normalizeProductStatus(value: string | undefined): ProductStatus {
  if (value === "เปิดขาย" || value === "ปิดชั่วคราว" || value === "รอข้อมูล" || value === "ซ่อนสินค้า") {
    return value;
  }
  if (value === "หยุดขาย") return "ปิดชั่วคราว";
  return "รอข้อมูล";
}

export function safeProductImageUrl(value: string | undefined, mediaOrigin = DEFAULT_PRODUCT_MEDIA_ORIGIN): string {
  const normalizedOrigin = mediaOrigin.trim().replace(/\/+$/, "");
  if (!value || !normalizedOrigin) return PRODUCT_IMAGE_PLACEHOLDER;

  try {
    const imageUrl = new URL(value.trim());
    const allowedOrigin = new URL(normalizedOrigin);
    if (imageUrl.protocol !== "https:" || imageUrl.origin !== allowedOrigin.origin) return PRODUCT_IMAGE_PLACEHOLDER;
    if (!imageUrl.pathname.startsWith("/products/") || imageUrl.username || imageUrl.password) return PRODUCT_IMAGE_PLACEHOLDER;
    return `/media${imageUrl.pathname}`;
  } catch {
    return PRODUCT_IMAGE_PLACEHOLDER;
  }
}

export function safeStorefrontAssetUrl(
  value: string | undefined,
  fallback: string,
  mediaOrigin = DEFAULT_PRODUCT_MEDIA_ORIGIN,
): string {
  const normalizedOrigin = mediaOrigin.trim().replace(/\/+$/, "");
  if (!value || !normalizedOrigin) return fallback;
  try {
    const assetUrl = new URL(value.trim());
    const allowedOrigin = new URL(normalizedOrigin);
    if (assetUrl.protocol !== "https:" || assetUrl.origin !== allowedOrigin.origin) return fallback;
    if (!assetUrl.pathname.startsWith("/brand/") || assetUrl.username || assetUrl.password) return fallback;
    return `/media${assetUrl.pathname}`;
  } catch {
    return fallback;
  }
}

function fallbackCategory(name: string): string {
  if (name.includes("แหนม")) return "แหนมหมู";
  if (name.includes("ไส้กรอก")) return "ไส้กรอกอีสาน";
  if (name.includes("แคปหมู")) return "แคปหมู";
  return "อื่น ๆ";
}

function positivePrice(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function catalogProductsFromRows(rows: string[][], mediaOrigin = DEFAULT_PRODUCT_MEDIA_ORIGIN): CatalogProduct[] {
  return rows.slice(1).flatMap((row) => {
    const id = row[0]?.trim() ?? "";
    const name = row[1]?.trim() ?? "";
    if (!id || !name || !/^[A-Za-z0-9_-]{2,40}$/.test(id)) return [];

    const requestedStatus = normalizeProductStatus(row[5]);
    if (requestedStatus === "ซ่อนสินค้า") return [];

    const unit = row[2]?.trim() ?? "";
    const detail = row[3]?.trim() ?? "";
    const price = positivePrice(row[4]);
    const isComplete = Boolean(unit && detail && price !== null);
    const status: VisibleProductStatus = requestedStatus === "เปิดขาย" && !isComplete ? "รอข้อมูล" : requestedStatus;

    return [{
      id,
      name,
      unit: unit || "รอข้อมูลหน่วยขาย",
      detail: detail || "รายละเอียดสินค้ารอข้อมูล",
      price,
      status,
      image: safeProductImageUrl(row[8], mediaOrigin),
      category: row[9]?.trim() || fallbackCategory(name),
    }];
  });
}

export function isProductPurchasable(product: Pick<CatalogProduct, "status" | "price">): boolean {
  return product.status === "เปิดขาย" && product.price !== null;
}
