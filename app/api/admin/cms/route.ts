import { NextResponse } from "next/server";
import { getAdminUser } from "../../../admin-auth";
import { isSameOriginMutation } from "../../../../lib/admin-auth";
import {
  PRODUCT_STATUSES,
  ROUND_STATUSES,
  type AdminStorefrontSettings,
  type ProductInput,
  type RoundInput,
} from "../../../../lib/admin-cms";
import {
  createAdminProduct,
  createAdminRound,
  getAdminCmsData,
  moveAdminProduct,
  updateAdminProduct,
  updateAdminRound,
  updateAdminStorefrontSettings,
  type CmsMutationResult,
} from "../../../../lib/google-sheets";

type ActionBody = Record<string, unknown> & { action?: unknown };
type CloudflareCacheStorage = CacheStorage & { default?: Cache };

export async function GET() {
  const user = await getAdminUser();
  if (!user) return json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, 401);
  try {
    return json(await getAdminCmsData());
  } catch (error) {
    return json({ error: errorMessage(error) }, 502);
  }
}

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, 401);
  if (!isSameOriginMutation(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);

  const body = await request.json().catch(() => null) as ActionBody | null;
  if (!body || typeof body.action !== "string") return json({ error: "ไม่พบคำสั่งที่ต้องการ" }, 400);

  try {
    let result: CmsMutationResult;
    switch (body.action) {
      case "product.create":
        result = await createAdminProduct(productInput(body.product));
        break;
      case "product.update": {
        const product = productInput(body.product);
        result = await updateAdminProduct(product.id, product);
        break;
      }
      case "product.move":
        result = await moveAdminProduct(requiredString(body.id, "รหัสสินค้า"), direction(body.direction), optionalString(body.fingerprint));
        break;
      case "round.create":
        result = await createAdminRound(roundInput(body.round));
        break;
      case "round.update":
        result = await updateAdminRound(requiredString(body.id, "รหัสรอบ"), roundInput(body.round));
        break;
      case "settings.update":
        result = await updateAdminStorefrontSettings(settingsInput(body.settings));
        break;
      default:
        return json({ error: "คำสั่งนี้ไม่รองรับ" }, 400);
    }

    if (result === "not_found") return json({ error: "ไม่พบข้อมูลที่ต้องการแก้ไข" }, 404);
    if (result === "duplicate") return json({ error: "มีรหัสหรือวันจัดส่งนี้อยู่แล้ว" }, 409);
    if (result === "conflict") return json({ error: "ข้อมูลถูกแก้จากที่อื่นแล้ว กรุณารีเฟรชก่อนบันทึกอีกครั้ง" }, 409);
    await invalidateStorefrontCache(request);
    return json({ ok: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
}

function productInput(value: unknown): ProductInput {
  const product = record(value, "ข้อมูลสินค้า");
  const status = requiredString(product.status, "สถานะสินค้า");
  if (!PRODUCT_STATUSES.includes(status as ProductInput["status"])) throw new Error("สถานะสินค้าไม่ถูกต้อง");
  const price = product.price === null || product.price === "" || product.price === undefined ? null : Number(product.price);
  return {
    id: requiredString(product.id, "รหัสสินค้า"),
    name: requiredString(product.name, "ชื่อสินค้า"),
    unit: optionalString(product.unit) ?? "",
    detail: optionalString(product.detail) ?? "",
    price,
    status: status as ProductInput["status"],
    imageUrl: optionalString(product.imageUrl) ?? "",
    fingerprint: optionalString(product.fingerprint),
  };
}

function roundInput(value: unknown): RoundInput {
  const round = record(value, "ข้อมูลรอบขาย");
  const status = requiredString(round.status, "สถานะรอบ");
  if (!ROUND_STATUSES.includes(status as RoundInput["status"])) throw new Error("สถานะรอบไม่ถูกต้อง");
  return {
    deliveryDate: requiredString(round.deliveryDate, "วันจัดส่ง"),
    opensAt: requiredString(round.opensAt, "เวลาเปิดรับ"),
    closesAt: requiredString(round.closesAt, "เวลาปิดรับ"),
    status: status as RoundInput["status"],
    note: optionalString(round.note) ?? "",
    fingerprint: optionalString(round.fingerprint),
  };
}

function settingsInput(value: unknown): Omit<AdminStorefrontSettings, "fingerprint"> & { fingerprint?: string } {
  const settings = record(value, "ข้อมูลหน้าร้าน");
  const shippingFee = settings.shippingFee === null || settings.shippingFee === "" || settings.shippingFee === undefined
    ? null
    : Number(settings.shippingFee);
  return {
    storeName: requiredString(settings.storeName, "ชื่อร้าน"),
    heroTitle: requiredString(settings.heroTitle, "หัวข้อหน้าร้าน"),
    heroHighlight: requiredString(settings.heroHighlight, "ข้อความเน้น"),
    heroDescription: requiredString(settings.heroDescription, "คำแนะนำร้าน"),
    announcementText: requiredString(settings.announcementText, "ข้อความประกาศ"),
    storyTitle: requiredString(settings.storyTitle, "หัวข้อเรื่องของร้าน"),
    storyDescription: requiredString(settings.storyDescription, "เรื่องของร้าน"),
    phonePrimary: requiredString(settings.phonePrimary, "เบอร์โทรหลัก"),
    phoneSecondary: requiredString(settings.phoneSecondary, "เบอร์โทรสำรอง"),
    shippingFee,
    pickupAddress: optionalString(settings.pickupAddress) ?? "",
    pickupMapUrl: optionalString(settings.pickupMapUrl) ?? "",
    fingerprint: optionalString(settings.fingerprint),
  };
}

function direction(value: unknown): "up" | "down" {
  if (value !== "up" && value !== "down") throw new Error("ทิศทางการเรียงสินค้าไม่ถูกต้อง");
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}ไม่ถูกต้อง`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`กรุณากรอก${label}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ";
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

async function invalidateStorefrontCache(request: Request): Promise<void> {
  const cacheStorage = (globalThis as typeof globalThis & { caches?: CloudflareCacheStorage }).caches;
  const cache = cacheStorage?.default;
  if (!cache) return;
  const url = new URL("/api/storefront", request.url);
  await cache.delete(new Request(url, { method: "GET" })).catch(() => false);
}
