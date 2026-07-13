import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import type { OrderStatus } from "../../../../../db/orders";
import { updateOrderStatus } from "../../../../../lib/google-sheets";

const statuses: OrderStatus[] = ["received", "preparing", "ready_for_pickup", "shipped", "completed", "cancelled"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401 });
  const { status } = (await request.json()) as { status?: string };
  if (!status || !statuses.includes(status as OrderStatus)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  const { id } = await context.params;
  const updated = await updateOrderStatus(id, status as OrderStatus);
  if (!updated) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
