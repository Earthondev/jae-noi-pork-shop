import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getPublicOrderByIdAndPhoneLast4 } from "../../../../db/order-repository";
import { isTrackingLookupInput } from "../../../../lib/order-tracking";
import { publicErrorBody } from "../../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../../lib/rate-limit";
import { MalformedRequestBodyError, parseBoundedJson, RequestBodyTooLargeError, UnsupportedRequestContentTypeError } from "../../../../lib/request-body";
import { reportServerError } from "../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };

const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_WINDOW = 8;
const MAX_LOOKUP_BODY_BYTES = 2 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const NOT_FOUND_MESSAGE = "ไม่พบออเดอร์ กรุณาตรวจสอบเลขออเดอร์และเบอร์โทร 4 ตัวท้าย";

function privateJson(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

export async function POST(request: Request) {
  try {
    const uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) {
      reportServerError({ event: "order_tracking_failed", operation: "tracking.resolve_storage", path: "/api/orders/track", method: "POST" });
      return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 503);
    }
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "tracking-rate", clientKey, { windowMs: LOOKUP_WINDOW_MS, max: MAX_LOOKUPS_PER_WINDOW }))) {
      return privateJson({ error: "ลองตรวจสอบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" }, 429, { "Retry-After": "900" });
    }

    const body = await parseBoundedJson(request, MAX_LOOKUP_BODY_BYTES) as { orderId?: unknown; phoneLast4?: unknown } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const phoneLast4 = typeof body?.phoneLast4 === "string" ? body.phoneLast4.trim() : "";
    if (!isTrackingLookupInput(orderId, phoneLast4)) {
      return privateJson({ error: "กรุณาตรวจสอบเลขออเดอร์และเบอร์โทร 4 ตัวท้าย" }, 400);
    }

    const order = await getPublicOrderByIdAndPhoneLast4(orderId, phoneLast4, { days: 30 });
    if (!order) return privateJson({ error: NOT_FOUND_MESSAGE }, 404);
    return privateJson({ orders: [order] });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return privateJson({ error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด" }, 413);
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return privateJson({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, 400);
    }
    reportServerError({ event: "order_tracking_failed", operation: "tracking.lookup", error, path: "/api/orders/track", method: "POST" });
    return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 500);
  }
}
