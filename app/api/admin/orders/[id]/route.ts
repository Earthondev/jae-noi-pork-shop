import { NextResponse } from "next/server";
import { getAdminUser } from "../../../../admin-auth";
import type { OrderStatus, PaymentStatus } from "../../../../../db/orders";
import { isSameOriginMutation } from "../../../../../lib/admin-auth";
import { updateAdminOrder } from "../../../../../db/order-repository";
import { publicErrorBody } from "../../../../../lib/public-errors";
import { reportServerError } from "../../../../../lib/server-monitoring";
import { MalformedRequestBodyError, parseBoundedJson, RequestBodyTooLargeError, UnsupportedRequestContentTypeError } from "../../../../../lib/request-body";
import { isCarrierCode, isValidTrackingNumber, normalizeTrackingNumber, type CarrierCode } from "../../../../../lib/carriers";

const MAX_UPDATE_BODY_BYTES = 4 * 1024;
const statuses: OrderStatus[] = ["received", "preparing", "ready_for_pickup", "shipped", "completed", "cancelled"];
const paymentStatuses: PaymentStatus[] = ["waiting_for_payment", "waiting_for_slip_review", "paid", "invalid_slip", "refunded"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });

  let body: { orderStatus?: unknown; paymentStatus?: unknown; trackingNumber?: unknown; carrierCode?: unknown } | null;
  try {
    body = await parseBoundedJson(request, MAX_UPDATE_BODY_BYTES) as typeof body;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "ข้อมูลมีขนาดใหญ่เกินกำหนด" }, { status: 413 });
    if (error instanceof UnsupportedRequestContentTypeError || error instanceof MalformedRequestBodyError) {
      return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
    }
    throw error;
  }
  const orderStatus = body?.orderStatus;
  const paymentStatus = body?.paymentStatus;
  const trackingNumber = body?.trackingNumber;
  const carrierCode = body?.carrierCode;
  if (orderStatus !== undefined && (typeof orderStatus !== "string" || !statuses.includes(orderStatus as OrderStatus))) {
    return NextResponse.json({ error: "สถานะออเดอร์ไม่ถูกต้อง" }, { status: 400 });
  }
  if (paymentStatus !== undefined && (typeof paymentStatus !== "string" || !paymentStatuses.includes(paymentStatus as PaymentStatus))) {
    return NextResponse.json({ error: "สถานะชำระเงินไม่ถูกต้อง" }, { status: 400 });
  }
  if (trackingNumber !== undefined && (typeof trackingNumber !== "string" || trackingNumber.length > 100)) {
    return NextResponse.json({ error: "เลขพัสดุยาวเกินไป" }, { status: 400 });
  }
  if (carrierCode !== undefined && carrierCode !== null && !isCarrierCode(carrierCode)) {
    return NextResponse.json({ error: "บริษัทขนส่งไม่ถูกต้อง" }, { status: 400 });
  }
  const effectiveCarrierCode = isCarrierCode(carrierCode) ? carrierCode : undefined;
  const normalizedTrackingNumber = typeof trackingNumber === "string" ? normalizeTrackingNumber(trackingNumber) : undefined;
  if (normalizedTrackingNumber && (!effectiveCarrierCode || !isValidTrackingNumber(effectiveCarrierCode, normalizedTrackingNumber))) {
    return NextResponse.json({ error: "เลขพัสดุไม่ตรงกับรูปแบบของบริษัทขนส่ง" }, { status: 400 });
  }
  if (orderStatus === undefined && paymentStatus === undefined && trackingNumber === undefined && carrierCode === undefined) {
    return NextResponse.json({ error: "ไม่พบข้อมูลที่ต้องการแก้ไข" }, { status: 400 });
  }

  const { id } = await context.params;
  let result: Awaited<ReturnType<typeof updateAdminOrder>>;
  try {
    result = await updateAdminOrder(id, {
      orderStatus: orderStatus as OrderStatus | undefined,
      paymentStatus: paymentStatus as PaymentStatus | undefined,
      trackingNumber: normalizedTrackingNumber,
      carrierCode: carrierCode as CarrierCode | null | undefined,
    });
  } catch (error) {
    reportServerError({ event: "admin_order_update_failed", operation: "admin.order.update", error, path: "/api/admin/orders/:id", method: "PATCH" });
    return NextResponse.json(publicErrorBody("ADMIN_UNAVAILABLE"), { status: 502 });
  }
  if (result === "not_found") return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (result === "payment_required") {
    return NextResponse.json({ error: "ต้องยืนยันการชำระเงินก่อนเปลี่ยนเป็นสถานะเตรียมหรือจัดส่ง" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
