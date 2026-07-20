import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { countRecentOrdersByPhone, findOrderByIdempotencyKey, insertOrder } from "../../../db/order-repository";
import { getStorefrontData } from "../../../db/storefront-repository";
import { createSecureOrderId } from "../../../lib/order-id";
import {
  clientPaymentStatus,
  databasePaymentStatus,
  paymentDecisionFromVerification,
  type ClientPaymentStatus,
  type SheetPaymentStatus,
} from "../../../lib/order-workflow";
import { verifySlipWithSlipOk } from "../../../lib/slipok";
import { publicErrorBody } from "../../../lib/public-errors";
import { checkRateLimit, clientIpKey } from "../../../lib/rate-limit";
import { reportServerError } from "../../../lib/server-monitoring";
import { formatThaiAddress, type StructuredThaiAddress } from "../../../lib/thai-address";
import { isValidStructuredThaiAddress } from "../../../lib/thai-address-validation";
import {
  detectSupportedImageType,
  OrderPayloadValidationError,
  validateOrderItemInputs,
  validateOrderRequestFields,
} from "../../../lib/order-request-validation";

type UploadBindings = { UPLOADS?: R2Bucket };
type IdempotencyReceipt = {
  state: "processing" | "completed";
  orderId: string;
  fingerprint: string;
  createdAt: string;
  paymentStatus?: ClientPaymentStatus;
};

const PROCESSING_RECEIPT_TTL_MS = 2 * 60 * 1000;
const ORDER_IP_WINDOW_MS = 30 * 60 * 1000;
const ORDER_IP_MAX_PER_WINDOW = 6;
const ORDER_PHONE_WINDOW_MS = 60 * 60 * 1000;
const ORDER_PHONE_MAX_PER_WINDOW = 3;

class OrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pendingResponse() {
  return NextResponse.json(
    { error: "ออเดอร์นี้กำลังบันทึกอยู่ กรุณารอสักครู่แล้วลองอีกครั้ง" },
    { status: 409, headers: { "Retry-After": "2" } },
  );
}

export async function POST(request: Request) {
  let uploads: R2Bucket | undefined;
  let receiptKey: string | null = null;
  let slipKey: string | null = null;
  let orderWritten = false;
  let ownsReceipt = false;
  let operation = "order.parse_request";

  try {
    const form = await request.formData();
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const structuredAddress: StructuredThaiAddress = {
      addressLine: String(form.get("addressLine") ?? "").trim(),
      subdistrict: String(form.get("subdistrict") ?? "").trim(),
      district: String(form.get("district") ?? "").trim(),
      province: String(form.get("province") ?? "").trim(),
      postalCode: String(form.get("postalCode") ?? "").trim(),
    };
    const note = String(form.get("note") ?? "").trim();
    const roundId = String(form.get("roundId") ?? "").trim();
    const fulfilment = String(form.get("fulfilment") ?? "");
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
    const rawItems = JSON.parse(String(form.get("items") ?? "[]")) as unknown;
    const slip = form.get("slip");
    validateOrderRequestFields({ customerName, note });
    const itemInputs = validateOrderItemInputs(rawItems);

    if (!customerName || !phone) return NextResponse.json({ error: "กรุณากรอกชื่อและเบอร์โทรให้ครบ" }, { status: 400 });
    if (!/^0[0-9\s-]{8,12}$/.test(phone)) return NextResponse.json({ error: "กรุณาตรวจสอบเบอร์โทรศัพท์" }, { status: 400 });
    if (fulfilment !== "pickup" && fulfilment !== "postal") return NextResponse.json({ error: "กรุณาเลือกวิธีรับสินค้า" }, { status: 400 });
    if (fulfilment === "postal" && (structuredAddress.addressLine.length > 500 || !isValidStructuredThaiAddress(structuredAddress))) {
      return NextResponse.json({ error: "กรุณาตรวจสอบจังหวัด อำเภอ ตำบล และรหัสไปรษณีย์" }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(idempotencyKey)) return NextResponse.json({ error: "ไม่พบรหัสป้องกันการสั่งซ้ำ กรุณาโหลดหน้าใหม่" }, { status: 400 });
    if (slip instanceof File && slip.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "สลิปต้องเป็นรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
    }
    const slipBytes = slip instanceof File && slip.size > 0 ? new Uint8Array(await slip.arrayBuffer()) : null;
    const slipImageType = slipBytes ? detectSupportedImageType(slipBytes) : null;
    if (slipBytes && !slipImageType) {
      return NextResponse.json({ error: "สลิปต้องเป็นไฟล์รูป JPG, PNG หรือ WebP ที่ถูกต้อง" }, { status: 400 });
    }

    uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) {
      reportServerError({
        event: "order_storage_unavailable",
        operation: "order.resolve_storage",
        path: "/api/orders",
        method: "POST",
      });
      return NextResponse.json(publicErrorBody("ORDER_UNAVAILABLE"), { status: 503 });
    }

    operation = "order.rate_limit_ip";
    const clientKey = clientIpKey(request);
    if (!(await checkRateLimit(uploads, "order-rate-ip", clientKey, { windowMs: ORDER_IP_WINDOW_MS, max: ORDER_IP_MAX_PER_WINDOW }))) {
      return NextResponse.json({ error: "สั่งซื้อถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" }, { status: 429, headers: { "Retry-After": String(ORDER_IP_WINDOW_MS / 1000) } });
    }

    operation = "order.rate_limit_phone";
    const recentOrdersForPhone = await countRecentOrdersByPhone(phone, new Date(Date.now() - ORDER_PHONE_WINDOW_MS).toISOString());
    if (recentOrdersForPhone >= ORDER_PHONE_MAX_PER_WINDOW) {
      return NextResponse.json({ error: "เบอร์นี้สั่งซื้อถี่เกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อร้านโดยตรง" }, { status: 429, headers: { "Retry-After": String(ORDER_PHONE_WINDOW_MS / 1000) } });
    }

    operation = "order.load_storefront";
    const storefront = await getStorefrontData();
    const selectedRound = storefront.rounds.find((round) => round.id === roundId);
    if (!selectedRound) return NextResponse.json({ error: "รอบพรีออเดอร์นี้ยังไม่เปิดรับหรือปิดรับแล้ว" }, { status: 400 });
    if (fulfilment === "postal" && storefront.shippingFee === null) return NextResponse.json({ error: "ค่าจัดส่งไปรษณีย์ยังรอข้อมูล" }, { status: 400 });
    if (fulfilment === "pickup" && !storefront.pickupAddress) {
      return NextResponse.json({ error: "ไม่สามารถรับเองหน้าร้านได้จนกว่าจะมีที่อยู่ร้าน" }, { status: 400 });
    }

    const productsById = new Map(storefront.products.map((product) => [product.id, product]));
    const items = itemInputs.map((candidate) => {
      const product = candidate.productId ? productsById.get(candidate.productId) : undefined;
      const quantity = Number(candidate.quantity);
      if (!product) throw new OrderRequestError("ไม่พบสินค้านี้หรือสินค้าถูกซ่อนแล้ว กรุณาโหลดหน้าใหม่", 409);
      if (product.status === "ปิดชั่วคราว") throw new OrderRequestError(`${product.name} ปิดรับชั่วคราว ระบบยังไม่รับออเดอร์รายการนี้`, 409);
      if (product.status !== "เปิดขาย" || product.price === null) throw new OrderRequestError(`${product.name} ยังรอข้อมูล จึงยังสั่งซื้อไม่ได้`, 409);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new OrderRequestError(`จำนวน ${product.name} ไม่ถูกต้อง`, 400);
      return { id: product.id, name: product.name, unit: product.unit, quantity, unitPrice: product.price };
    });

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingFee = fulfilment === "postal" ? storefront.shippingFee ?? 0 : 0;
    const address = fulfilment === "postal" ? formatThaiAddress(structuredAddress) : storefront.pickupAddress ?? "";
    const fingerprint = await sha256Hex(JSON.stringify({
      customerName,
      phone,
      address,
      note,
      roundId,
      fulfilment,
      items: [...items].sort((left, right) => left.id.localeCompare(right.id)),
      slip: slip instanceof File && slipBytes && slipImageType ? { name: slip.name, size: slipBytes.byteLength, type: slipImageType.contentType } : null,
    }));
    let orderId = await createSecureOrderId(selectedRound.id, idempotencyKey);
    const createdAt = new Date().toISOString();
    receiptKey = `idempotency/orders/${await sha256Hex(idempotencyKey)}.json`;
    let receipt: IdempotencyReceipt = { state: "processing", orderId, fingerprint, createdAt };

    operation = "order.claim_idempotency";
    const acquired = await uploads.put(receiptKey, JSON.stringify(receipt), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    ownsReceipt = acquired !== null;

    if (!acquired) {
      const existingObject = await uploads.get(receiptKey);
      if (!existingObject) return pendingResponse();
      const existingReceipt = await existingObject.json<IdempotencyReceipt>();
      if (existingReceipt.fingerprint !== fingerprint) {
        return NextResponse.json({ error: "รหัสออเดอร์นี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาโหลดหน้าใหม่" }, { status: 409 });
      }
      if (existingReceipt.state === "completed" && existingReceipt.paymentStatus) {
        return NextResponse.json({ orderId: existingReceipt.orderId, paymentStatus: existingReceipt.paymentStatus, duplicate: true });
      }

      const existingOrder = await findOrderByIdempotencyKey(idempotencyKey);
      if (existingOrder) {
        const status = clientPaymentStatus(existingOrder.paymentStatus);
        await uploads.put(receiptKey, JSON.stringify({ ...existingReceipt, state: "completed", orderId: existingOrder.orderId, paymentStatus: status }), {
          httpMetadata: { contentType: "application/json" },
        });
        return NextResponse.json({ orderId: existingOrder.orderId, paymentStatus: status, duplicate: true });
      }
      const receiptAge = Date.now() - Date.parse(existingReceipt.createdAt);
      if (!Number.isFinite(receiptAge) || receiptAge < PROCESSING_RECEIPT_TTL_MS) return pendingResponse();
      receipt = { ...existingReceipt, state: "processing", createdAt };
      const takeover = await uploads.put(receiptKey, JSON.stringify(receipt), {
        onlyIf: { etagMatches: existingObject.etag },
        httpMetadata: { contentType: "application/json" },
      });
      if (!takeover) return pendingResponse();
      ownsReceipt = true;
      orderId = existingReceipt.orderId;
    }

    let paymentStatus: SheetPaymentStatus = "รอชำระเงิน";
    let adminNote = "";

    if (slip instanceof File && slipBytes && slipImageType) {
      operation = "order.store_slip";
      slipKey = `slips/${orderId}/original`;
      await uploads.put(slipKey, slipBytes, { httpMetadata: { contentType: slipImageType.contentType }, customMetadata: { orderId } });
      const verifiedSlip = new File([slipBytes], slip.name, { type: slipImageType.contentType });
      const verification = await verifySlipWithSlipOk(verifiedSlip, subtotal + shippingFee, clientKey);
      const decision = paymentDecisionFromVerification(verification);
      paymentStatus = decision.paymentStatus;
      adminNote = decision.adminNote;
    }

    operation = "order.insert_d1";
    await insertOrder({
      id: orderId,
      roundId,
      deliveryDate: selectedRound.deliveryDate,
      createdAt,
      customerName,
      phone,
      fulfilment,
      address,
      addressLine: fulfilment === "postal" ? structuredAddress.addressLine : "",
      subdistrict: fulfilment === "postal" ? structuredAddress.subdistrict : "",
      district: fulfilment === "postal" ? structuredAddress.district : "",
      province: fulfilment === "postal" ? structuredAddress.province : "",
      postalCode: fulfilment === "postal" ? structuredAddress.postalCode : "",
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      slipKey,
      paymentStatus: databasePaymentStatus(paymentStatus),
      orderStatus: "received",
      adminNote,
      note,
      idempotencyKey,
      items,
    });
    orderWritten = true;

    const responsePaymentStatus = clientPaymentStatus(paymentStatus);
    operation = "order.complete_idempotency";
    await uploads.put(receiptKey, JSON.stringify({ ...receipt, state: "completed", orderId, paymentStatus: responsePaymentStatus }), {
      httpMetadata: { contentType: "application/json" },
    });
    return NextResponse.json({ orderId, paymentStatus: responsePaymentStatus }, { status: 201 });
  } catch (error) {
    if (uploads && receiptKey && ownsReceipt && !orderWritten) await uploads.delete(receiptKey).catch(() => undefined);
    if (uploads && slipKey && !orderWritten) await uploads.delete(slipKey).catch(() => undefined);
    if (error instanceof OrderRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OrderPayloadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    reportServerError({
      event: "order_write_failed",
      operation,
      error,
      path: "/api/orders",
      method: "POST",
      tags: { receiptClaimed: ownsReceipt, orderWritten },
    });
    return NextResponse.json(publicErrorBody("ORDER_UNAVAILABLE"), { status: 500 });
  }
}
