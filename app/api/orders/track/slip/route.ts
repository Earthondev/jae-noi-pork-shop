import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { applySlipReupload, findOrderForSlipReupload } from "../../../../../db/order-repository";
import { ImageNormalizationError, normalizeUploadedImage, type ImageTransformBinding } from "../../../../../lib/image-normalization";
import { isTrackingLookupInput } from "../../../../../lib/order-tracking";
import { databasePaymentStatus, paymentDecisionFromVerification } from "../../../../../lib/order-workflow";
import { detectSupportedImageType } from "../../../../../lib/order-request-validation";
import { publicErrorBody } from "../../../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../../../lib/rate-limit";
import { MalformedRequestBodyError, parseBoundedFormData, RequestBodyTooLargeError, toOwnedArrayBuffer, UnsupportedRequestContentTypeError } from "../../../../../lib/request-body";
import { reportServerError } from "../../../../../lib/server-monitoring";
import { verifySlipWithSlipOk } from "../../../../../lib/slipok";

type SlipBindings = { UPLOADS?: R2Bucket; IMAGES?: ImageTransformBinding };

const REUPLOAD_WINDOW_MS = 60 * 60 * 1000;
const MAX_REUPLOADS_PER_WINDOW = 5;
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const MAX_NORMALIZED_SLIP_BYTES = 6 * 1024 * 1024;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function privateJson(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extraHeaders } });
}

export async function POST(request: Request) {
  let operation = "tracking.slip.resolve_storage";
  try {
    const bindings = env as unknown as SlipBindings;
    const uploads = bindings.UPLOADS;
    if (!uploads) {
      reportServerError({ event: "order_tracking_failed", operation, path: "/api/orders/track/slip", method: "POST" });
      return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 503);
    }

    operation = "tracking.slip.rate_limit";
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "tracking-slip-rate", clientKey, { windowMs: REUPLOAD_WINDOW_MS, max: MAX_REUPLOADS_PER_WINDOW }))) {
      return privateJson({ error: "ส่งสลิปถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" }, 429, { "Retry-After": String(REUPLOAD_WINDOW_MS / 1000) });
    }

    operation = "tracking.slip.parse_request";
    const form = await parseBoundedFormData(request, MAX_REQUEST_BYTES);
    const orderId = String(form.get("orderId") ?? "").trim();
    const phoneLast4 = String(form.get("phoneLast4") ?? "").trim();
    if (!isTrackingLookupInput(orderId, phoneLast4)) {
      return privateJson({ error: "ข้อมูลไม่ถูกต้อง กรุณาลองใหม่" }, 400);
    }

    const slip = form.get("slip");
    if (!(slip instanceof File) || slip.size === 0) {
      return privateJson({ error: "กรุณาแนบรูปสลิป" }, 400);
    }
    if (slip.size > 5 * 1024 * 1024) {
      return privateJson({ error: "สลิปต้องเป็นรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, 400);
    }
    const slipBytes = new Uint8Array(await slip.arrayBuffer());
    if (!detectSupportedImageType(slipBytes)) {
      return privateJson({ error: "สลิปต้องเป็นไฟล์รูป JPG, PNG หรือ WebP ที่ถูกต้อง" }, 400);
    }

    operation = "tracking.slip.lookup_order";
    const target = await findOrderForSlipReupload(orderId, phoneLast4);
    if (target === "not_found") {
      return privateJson({ error: "ไม่พบออเดอร์นี้ กรุณาตรวจสอบเบอร์โทรและเลขออเดอร์" }, 404);
    }
    if (target === "not_eligible") {
      return privateJson({ error: "ออเดอร์นี้แนบสลิปใหม่ไม่ได้แล้ว กรุณาติดต่อร้านโดยตรง" }, 409);
    }

    operation = "tracking.slip.normalize";
    const normalizedSlip = await normalizeUploadedImage(slipBytes, bindings.IMAGES, {
      purpose: "payment-slip",
      maxOutputBytes: MAX_NORMALIZED_SLIP_BYTES,
    });

    // Stored beside the original rather than over it, so the shop can still
    // look at the slip that was rejected when a customer calls about it.
    operation = "tracking.slip.store";
    const slipKey = `slips/${orderId}/retry-1`;
    await uploads.put(slipKey, normalizedSlip.bytes, {
      httpMetadata: { contentType: normalizedSlip.contentType },
      customMetadata: { orderId },
    });

    operation = "tracking.slip.verify";
    const verifiedSlip = new File([toOwnedArrayBuffer(normalizedSlip.bytes)], `slip.${normalizedSlip.extension}`, { type: normalizedSlip.contentType });
    const verification = await verifySlipWithSlipOk(verifiedSlip, target.total, clientKey);
    const decision = paymentDecisionFromVerification(verification);

    operation = "tracking.slip.apply";
    const paymentStatus = databasePaymentStatus(decision.paymentStatus);
    const applied = await applySlipReupload(orderId, {
      slipKey,
      paymentStatus,
      adminNote: `ลูกค้าแนบสลิปใหม่ · ${decision.adminNote}`,
    });
    if (!applied) {
      // Another request spent the retry first, or the shop resolved the order
      // by hand while this upload was in flight. The stored slip stays put for
      // the shop to look at; only the customer-visible answer changes.
      return privateJson({ error: "ออเดอร์นี้แนบสลิปใหม่ไม่ได้แล้ว กรุณาติดต่อร้านโดยตรง" }, 409);
    }

    // The tracking page speaks database payment statuses, so hand back the same
    // vocabulary it already renders rather than a second status spelling.
    return privateJson({ ok: true, paymentStatus, retriesLeft: 0 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return privateJson({ error: "ไฟล์สลิปมีขนาดใหญ่เกินกำหนด" }, 413);
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return privateJson({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, 400);
    }
    if (error instanceof ImageNormalizationError) {
      return privateJson({ error: "สลิปไม่ใช่รูปที่ระบบอ่านได้ หรือรูปมีขนาดใหญ่เกินกำหนด" }, 400);
    }
    reportServerError({ event: "order_tracking_failed", operation, error, path: "/api/orders/track/slip", method: "POST" });
    return privateJson(publicErrorBody("TRACKING_UNAVAILABLE"), 500);
  }
}
