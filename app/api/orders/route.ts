import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { appendOrder, findOrderByIdempotencyKey, getStorefrontData } from "../../../lib/google-sheets";
import { verifySlipWithSlipOk } from "../../../lib/slipok";

type OrderItemInput = { productId?: string; quantity?: number };
type UploadBindings = { UPLOADS?: R2Bucket };
type ClientPaymentStatus = "waiting" | "review" | "verified";
type IdempotencyReceipt = {
  state: "processing" | "completed";
  orderId: string;
  fingerprint: string;
  createdAt: string;
  paymentStatus?: ClientPaymentStatus;
};

const PROCESSING_RECEIPT_TTL_MS = 2 * 60 * 1000;

class OrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createSecureOrderId(idempotencyKey: string): Promise<string> {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replaceAll("-", "");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(idempotencyKey)));
  const suffix = Array.from(digest.slice(0, 10), (byte) => alphabet[byte & 31]).join("");
  return `JN-${date}-${suffix}`;
}

function clientPaymentStatus(paymentStatus: string): ClientPaymentStatus {
  if (paymentStatus === "ชำระแล้ว") return "verified";
  if (paymentStatus === "รอตรวจสลิป") return "review";
  return "waiting";
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

  try {
    const form = await request.formData();
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const roundId = String(form.get("roundId") ?? "").trim();
    const fulfilment = String(form.get("fulfilment") ?? "");
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
    const rawItems = JSON.parse(String(form.get("items") ?? "[]")) as unknown;
    const slip = form.get("slip");

    if (!customerName || !phone) return NextResponse.json({ error: "กรุณากรอกชื่อและเบอร์โทรให้ครบ" }, { status: 400 });
    if (!/^0[0-9\s-]{8,12}$/.test(phone)) return NextResponse.json({ error: "กรุณาตรวจสอบเบอร์โทรศัพท์" }, { status: 400 });
    if (fulfilment !== "pickup" && fulfilment !== "postal") return NextResponse.json({ error: "กรุณาเลือกวิธีรับสินค้า" }, { status: 400 });
    if (fulfilment === "postal" && !address) return NextResponse.json({ error: "กรุณากรอกที่อยู่จัดส่ง" }, { status: 400 });
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(idempotencyKey)) return NextResponse.json({ error: "ไม่พบรหัสป้องกันการสั่งซ้ำ กรุณาโหลดหน้าใหม่" }, { status: 400 });
    if (!Array.isArray(rawItems) || rawItems.length === 0) return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 400 });
    if (slip instanceof File && slip.size > 0 && (slip.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(slip.type))) {
      return NextResponse.json({ error: "สลิปต้องเป็นรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
    }

    const storefront = await getStorefrontData();
    if (!storefront.rounds.some((round) => round.id === roundId)) return NextResponse.json({ error: "รอบพรีออเดอร์นี้ยังไม่เปิดรับหรือปิดรับแล้ว" }, { status: 400 });
    if (fulfilment === "postal" && storefront.shippingFee === null) return NextResponse.json({ error: "ค่าจัดส่งไปรษณีย์ยังรอข้อมูล" }, { status: 400 });
    if (fulfilment === "pickup" && !storefront.pickupAddress) {
      return NextResponse.json({ error: "ไม่สามารถรับเองหน้าร้านได้จนกว่าจะมีที่อยู่ร้าน" }, { status: 400 });
    }

    const productsById = new Map(storefront.products.map((product) => [product.id, product]));
    const items = rawItems.map((raw) => {
      if (typeof raw !== "object" || raw === null) throw new OrderRequestError("ข้อมูลสินค้าไม่ถูกต้อง", 400);
      const candidate = raw as OrderItemInput;
      const product = candidate.productId ? productsById.get(candidate.productId) : undefined;
      const quantity = Number(candidate.quantity);
      if (!product || product.status !== "เปิดขาย" || product.price === null || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new OrderRequestError("รายการสินค้าหรือจำนวนไม่ถูกต้อง", 400);
      }
      return { id: product.id, name: product.name, unit: product.unit, quantity, unitPrice: product.price };
    });

    uploads = (env as unknown as UploadBindings).UPLOADS;
    if (!uploads) return NextResponse.json({ error: "ระบบป้องกันออเดอร์ซ้ำยังไม่พร้อม กรุณาลองใหม่ภายหลัง" }, { status: 503 });

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingFee = fulfilment === "postal" ? storefront.shippingFee ?? 0 : 0;
    const fingerprint = await sha256Hex(JSON.stringify({
      customerName,
      phone,
      address,
      note,
      roundId,
      fulfilment,
      items: [...items].sort((left, right) => left.id.localeCompare(right.id)),
      slip: slip instanceof File && slip.size > 0 ? { name: slip.name, size: slip.size, type: slip.type } : null,
    }));
    let orderId = await createSecureOrderId(idempotencyKey);
    const createdAt = new Date().toISOString();
    receiptKey = `idempotency/orders/${await sha256Hex(idempotencyKey)}.json`;
    let receipt: IdempotencyReceipt = { state: "processing", orderId, fingerprint, createdAt };

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

    let paymentStatus: "รอชำระเงิน" | "รอตรวจสลิป" | "ชำระแล้ว" = "รอชำระเงิน";
    const orderStatus = "รับออเดอร์แล้ว" as const;
    let adminNote = "";

    if (slip instanceof File && slip.size > 0) {
      slipKey = `slips/${orderId}/original`;
      await uploads.put(slipKey, slip.stream(), { httpMetadata: { contentType: slip.type }, customMetadata: { orderId } });
      const clientKey = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      const verification = await verifySlipWithSlipOk(slip, subtotal + shippingFee, clientKey);
      if (verification.status === "rejected") throw new OrderRequestError(verification.reason, 400);
      if (verification.status === "verified") {
        paymentStatus = "ชำระแล้ว";
        adminNote = `SlipOK ยืนยันแล้ว · Ref ${verification.transactionReference} · ${verification.verifiedAt}`;
      } else {
        paymentStatus = "รอตรวจสลิป";
        if (verification.status === "pending") adminNote = `SlipOK รอตรวจ · ${verification.reason}`;
      }
    }

    await appendOrder({
      id: orderId,
      roundId,
      createdAt,
      customerName,
      phone,
      fulfilment,
      address: fulfilment === "pickup" ? storefront.pickupAddress ?? "" : address,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      slipKey,
      paymentStatus,
      orderStatus,
      adminNote,
      note,
      idempotencyKey,
      items,
    });
    orderWritten = true;

    const responsePaymentStatus = clientPaymentStatus(paymentStatus);
    await uploads.put(receiptKey, JSON.stringify({ ...receipt, state: "completed", orderId, paymentStatus: responsePaymentStatus }), {
      httpMetadata: { contentType: "application/json" },
    });
    return NextResponse.json({ orderId, paymentStatus: responsePaymentStatus }, { status: 201 });
  } catch (error) {
    if (uploads && receiptKey && ownsReceipt && !orderWritten) await uploads.delete(receiptKey).catch(() => undefined);
    if (uploads && slipKey && !orderWritten) await uploads.delete(slipKey).catch(() => undefined);
    const status = error instanceof OrderRequestError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกออเดอร์ไม่สำเร็จ" }, { status });
  }
}
