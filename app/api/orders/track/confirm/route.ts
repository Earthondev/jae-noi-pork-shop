import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { confirmOrderReceivedByPhoneLast4 } from "../../../../../db/order-repository";
import { isTrackingLookupInput } from "../../../../../lib/order-tracking";
import { publicErrorBody } from "../../../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../../../lib/rate-limit";
import { MalformedRequestBodyError, parseBoundedJson, RequestBodyTooLargeError, UnsupportedRequestContentTypeError } from "../../../../../lib/request-body";
import { reportServerError } from "../../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };

const CONFIRM_WINDOW_MS = 15 * 60 * 1000;
const MAX_CONFIRMS_PER_WINDOW = 10;
const MAX_CONFIRM_BODY_BYTES = 2 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

export async function POST(request: Request) {
  try {
    const uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) {
      reportServerError({ event: "order_tracking_failed", operation: "tracking.confirm_resolve_storage", path: "/api/orders/track/confirm", method: "POST" });
      return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 503);
    }
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "tracking-confirm-rate", clientKey, { windowMs: CONFIRM_WINDOW_MS, max: MAX_CONFIRMS_PER_WINDOW }))) {
      return privateJson({ error: "ลองหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" }, 429, { "Retry-After": "900" });
    }

    const body = await parseBoundedJson(request, MAX_CONFIRM_BODY_BYTES) as { phoneLast4?: unknown; orderId?: unknown } | null;
    const phoneLast4 = typeof body?.phoneLast4 === "string" ? body.phoneLast4.trim() : "";
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    if (!isTrackingLookupInput(orderId, phoneLast4)) {
      return privateJson({ error: "ข้อมูลไม่ถูกต้อง กรุณาลองใหม่" }, 400);
    }

    const result = await confirmOrderReceivedByPhoneLast4(orderId, phoneLast4);
    if (result === "not_found") return privateJson({ error: "ไม่พบออเดอร์นี้ กรุณาตรวจสอบเบอร์โทรและเลขออเดอร์" }, 404);
    if (result === "not_eligible") return privateJson({ error: "ออเดอร์นี้ยังไม่พร้อมให้ยืนยันรับสินค้า" }, 409);
    return privateJson({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return privateJson({ error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด" }, 413);
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return privateJson({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, 400);
    }
    reportServerError({ event: "order_tracking_failed", operation: "tracking.confirm", error, path: "/api/orders/track/confirm", method: "POST" });
    return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 500);
  }
}
