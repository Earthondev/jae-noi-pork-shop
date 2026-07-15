import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getPublicOrdersByPhone } from "../../../../db/order-repository";
import { isPhoneTrackingLookupInput, normalizePhone } from "../../../../lib/order-tracking";
import { publicErrorBody } from "../../../../lib/public-errors";
import { reportServerError } from "../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };
type RateLimitReceipt = { count: number; expiresAt: number };

const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const NOT_FOUND_MESSAGE = "ไม่พบออเดอร์ย้อนหลัง 30 วัน กรุณาตรวจสอบเบอร์โทรศัพท์";

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
    const body = await request.json().catch(() => null) as { phone?: unknown } | null;
    const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : "";
    if (!isPhoneTrackingLookupInput(phone)) {
      return privateJson({ error: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง" }, 400);
    }

    const uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) {
      reportServerError({ event: "order_tracking_failed", operation: "tracking.resolve_storage", path: "/api/orders/track", method: "POST" });
      return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 503);
    }
    const clientKey = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "local";
    if (!(await canLookupOrder(uploads, clientKey))) {
      return privateJson({ error: "ลองตรวจสอบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" }, 429, { "Retry-After": "900" });
    }

    const orders = await getPublicOrdersByPhone(phone, { days: 30, limit: 10 });
    if (orders.length === 0) return privateJson({ error: NOT_FOUND_MESSAGE }, 404);
    return privateJson({ orders });
  } catch (error) {
    reportServerError({ event: "order_tracking_failed", operation: "tracking.lookup", error, path: "/api/orders/track", method: "POST" });
    return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 500);
  }
}
