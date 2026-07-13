import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getPublicOrderTracking } from "../../../../lib/google-sheets";
import { isTrackingLookupInput } from "../../../../lib/order-tracking";

type UploadBindings = { UPLOADS?: R2Bucket };
type RateLimitReceipt = { count: number; expiresAt: number };

const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const NOT_FOUND_MESSAGE = "ไม่พบออเดอร์ กรุณาตรวจสอบเลขออเดอร์และเบอร์โทร 4 ตัวท้าย";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function canLookupOrder(uploads: R2Bucket, clientKey: string): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / LOOKUP_WINDOW_MS) * LOOKUP_WINDOW_MS;
  const clientHash = await sha256Hex(clientKey);
  const key = `tracking-rate/${clientHash}/${windowStart}.json`;
  const previousKey = `tracking-rate/${clientHash}/${windowStart - LOOKUP_WINDOW_MS}.json`;
  void uploads.delete(previousKey).catch(() => undefined);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await uploads.get(key);
    if (!existing) {
      const created = await uploads.put(key, JSON.stringify({ count: 1, expiresAt: windowStart + LOOKUP_WINDOW_MS }), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
      if (created) return true;
      continue;
    }

    const receipt = await existing.json<RateLimitReceipt>().catch(() => null);
    if (!receipt || receipt.expiresAt <= now || receipt.count >= MAX_LOOKUPS_PER_WINDOW) return false;
    const updated = await uploads.put(key, JSON.stringify({ ...receipt, count: receipt.count + 1 }), {
      onlyIf: { etagMatches: existing.etag },
      httpMetadata: { contentType: "application/json" },
    });
    if (updated) return true;
  }
  return false;
}

function privateJson(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { orderId?: unknown; phoneLast4?: unknown } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim().toUpperCase() : "";
    const phoneLast4 = typeof body?.phoneLast4 === "string" ? body.phoneLast4.trim() : "";
    if (!isTrackingLookupInput(orderId, phoneLast4)) {
      return privateJson({ error: "กรุณากรอกเลขออเดอร์และเบอร์โทร 4 ตัวท้ายให้ถูกต้อง" }, 400);
    }

    const uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) return privateJson({ error: "ระบบติดตามยังไม่พร้อม กรุณาลองใหม่ภายหลัง" }, 503);
    const clientKey = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "local";
    if (!(await canLookupOrder(uploads, clientKey))) {
      return privateJson({ error: "ลองตรวจสอบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" }, 429, { "Retry-After": "900" });
    }

    const order = await getPublicOrderTracking(orderId, phoneLast4);
    if (!order) return privateJson({ error: NOT_FOUND_MESSAGE }, 404);
    return privateJson({ order });
  } catch {
    return privateJson({ error: "ตรวจสอบออเดอร์ไม่สำเร็จ กรุณาลองใหม่ภายหลัง" }, 500);
  }
}
