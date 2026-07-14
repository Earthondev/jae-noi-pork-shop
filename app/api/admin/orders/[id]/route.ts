import { NextResponse } from "next/server";
import { getAdminUser } from "../../../../admin-auth";
import type { OrderStatus, PaymentStatus } from "../../../../../db/orders";
import { isSameOriginMutation } from "../../../../../lib/admin-auth";
import { updateAdminOrder } from "../../../../../lib/google-sheets";

const statuses: OrderStatus[] = ["received", "preparing", "ready_for_pickup", "shipped", "completed", "cancelled"];
const paymentStatuses: PaymentStatus[] = ["waiting_for_payment", "waiting_for_slip_review", "paid", "invalid_slip", "refunded"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401 });
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    orderStatus?: unknown;
    paymentStatus?: unknown;
    trackingNumber?: unknown;
  } | null;
  const orderStatus = body?.orderStatus;
  const paymentStatus = body?.paymentStatus;
  const trackingNumber = body?.trackingNumber;
  if (orderStatus !== undefined && (typeof orderStatus !== "string" || !statuses.includes(orderStatus as OrderStatus))) {
    return NextResponse.json({ error: "สถานะออเดอร์ไม่ถูกต้อง" }, { status: 400 });
  }
  if (paymentStatus !== undefined && (typeof paymentStatus !== "string" || !paymentStatuses.includes(paymentStatus as PaymentStatus))) {
    return NextResponse.json({ error: "สถานะชำระเงินไม่ถูกต้อง" }, { status: 400 });
  }
  if (trackingNumber !== undefined && (typeof trackingNumber !== "string" || trackingNumber.length > 100)) {
    return NextResponse.json({ error: "เลขพัสดุยาวเกินไป" }, { status: 400 });
  }
  if (orderStatus === undefined && paymentStatus === undefined && trackingNumber === undefined) {
    return NextResponse.json({ error: "ไม่พบข้อมูลที่ต้องการแก้ไข" }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await updateAdminOrder(id, {
    orderStatus: orderStatus as OrderStatus | undefined,
    paymentStatus: paymentStatus as PaymentStatus | undefined,
    trackingNumber: trackingNumber as string | undefined,
  });
  if (result === "not_found") return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (result === "payment_required") {
    return NextResponse.json({ error: "ต้องยืนยันการชำระเงินก่อนเปลี่ยนเป็นสถานะเตรียมหรือจัดส่ง" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
