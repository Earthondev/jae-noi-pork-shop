import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getPublicOrdersByPhone } from "../../../../db/order-repository";
import { isPhoneTrackingLookupInput, normalizePhone } from "../../../../lib/order-tracking";
import { publicErrorBody } from "../../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../../lib/rate-limit";
import { reportServerError } from "../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };

const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 10;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const NOT_FOUND_MESSAGE = "ไม่พบออเดอร์ย้อนหลัง 30 วัน กรุณาตรวจสอบเบอร์โทรศัพท์";

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
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "tracking-rate", clientKey, { windowMs: LOOKUP_WINDOW_MS, max: MAX_LOOKUPS_PER_WINDOW }))) {
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
