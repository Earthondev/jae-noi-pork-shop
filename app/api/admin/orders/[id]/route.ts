import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureOrderSchema, getBindings, type OrderStatus } from "../../../../../db/orders";

const statuses: OrderStatus[] = ["waiting_for_payment_info", "waiting_for_slip_review", "paid", "preparing", "shipped", "cancelled"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบผู้ดูแล" }, { status: 401 });
  const { status } = (await request.json()) as { status?: string };
  if (!status || !statuses.includes(status as OrderStatus)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  const { id } = await context.params;
  const { DB } = getBindings();
  await ensureOrderSchema(DB);
  await DB.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
  return NextResponse.json({ ok: true });
}
