import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getPublicOrdersByPhone } from "../../../../db/order-repository";
import { isPhoneTrackingLookupInput } from "../../../../lib/order-tracking";
import { publicErrorBody } from "../../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../../lib/rate-limit";
import { MalformedRequestBodyError, parseBoundedJson, RequestBodyTooLargeError, UnsupportedRequestContentTypeError } from "../../../../lib/request-body";
import { reportServerError } from "../../../../lib/server-monitoring";

type UploadBindings = { UPLOADS?: R2Bucket };

const IP_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_IP_WINDOW = 8;
// A phone-only lookup is a single low-entropy factor, so a stranger who knows
// the number can also burn its daily quota — accepted tradeoff for dropping
// the order-number requirement (see plan). This cap just keeps that abuse
// bounded, it isn't real protection.
const PHONE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKUPS_PER_PHONE_WINDOW = 10;
const MAX_LOOKUP_BODY_BYTES = 2 * 1024;
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
      reportServerError({ event: "order_tracking_failed", operation: "tracking.resolve_storage", path: "/api/orders/track", method: "POST" });
      return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 503);
    }
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "tracking-rate", clientKey, { windowMs: IP_WINDOW_MS, max: MAX_LOOKUPS_PER_IP_WINDOW }))) {
      return privateJson({ error: "ลองตรวจสอบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" }, 429, { "Retry-After": "900" });
    }

    const body = await parseBoundedJson(request, MAX_LOOKUP_BODY_BYTES) as { phone?: unknown } | null;
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!isPhoneTrackingLookupInput(phone)) {
      return privateJson({ error: "กรุณากรอกเบอร์โทรศัพท์ 9-10 หลัก ขึ้นต้นด้วย 0" }, 400);
    }

    if (!(await checkRateLimit(uploads, "tracking-phone-day", phone, { windowMs: PHONE_WINDOW_MS, max: MAX_LOOKUPS_PER_PHONE_WINDOW }))) {
      return privateJson({ error: "ค้นหาด้วยเบอร์นี้ครบ 10 ครั้งวันนี้แล้ว กรุณาลองใหม่พรุ่งนี้ หรือโทรหาร้านได้เลย" }, 429, { "Retry-After": "3600" });
    }

    // No match is a normal, expected result of a customer mistyping a digit —
    // it's still 200, so the client can tell "nothing found" apart from
    // "request failed" and show the calm not-found state instead of an error.
    const orders = await getPublicOrdersByPhone(phone, { days: 30 });
    return privateJson({ orders });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return privateJson({ error: "ข้อมูลคำขอมีขนาดใหญ่เกินกำหนด" }, 413);
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return privateJson({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, 400);
    }
    reportServerError({ event: "order_tracking_failed", operation: "tracking.lookup", error, path: "/api/orders/track", method: "POST" });
    return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 500);
  }
}
