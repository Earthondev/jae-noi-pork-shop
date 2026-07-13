import { NextResponse } from "next/server";
import { createOrderId, ensureOrderSchema, getBindings } from "../../../db/orders";

type OrderItemInput = { productId: string; name: string; quantity: number; unitPrice: number };

const allowedProducts: Record<string, { name: string; unitPrice: number }> = {
  "naem-pork": { name: "แหนมหมู", unitPrice: 50 },
  "pork-rinds": { name: "แคปหมู", unitPrice: 150 },
};

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const rawItems = JSON.parse(String(form.get("items") ?? "[]")) as unknown;

    if (!customerName || !phone || !address) return NextResponse.json({ error: "กรุณากรอกชื่อ เบอร์โทร และที่อยู่ให้ครบ" }, { status: 400 });
    if (!/^0[0-9\s-]{8,12}$/.test(phone)) return NextResponse.json({ error: "กรุณาตรวจสอบเบอร์โทรศัพท์" }, { status: 400 });
    if (!Array.isArray(rawItems) || rawItems.length === 0) return NextResponse.json({ error: "ไม่พบสินค้าในตะกร้า" }, { status: 400 });

    const items: OrderItemInput[] = rawItems.map((raw) => {
      if (typeof raw !== "object" || raw === null) throw new Error("ข้อมูลสินค้าไม่ถูกต้อง");
      const candidate = raw as Partial<OrderItemInput>;
      const product = candidate.productId ? allowedProducts[candidate.productId] : undefined;
      if (!product || !Number.isInteger(candidate.quantity) || Number(candidate.quantity) < 1 || Number(candidate.quantity) > 99) throw new Error("รายการสินค้าหรือจำนวนไม่ถูกต้อง");
      return { productId: candidate.productId as string, name: product.name, quantity: Number(candidate.quantity), unitPrice: product.unitPrice };
    });

    const { DB, UPLOADS } = getBindings();
    await ensureOrderSchema(DB);
    const orderId = createOrderId();
    const now = new Date().toISOString();
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const slip = form.get("slip");
    let slipKey: string | null = null;

    if (slip instanceof File && slip.size > 0) {
      if (slip.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(slip.type)) return NextResponse.json({ error: "สลิปต้องเป็นรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB" }, { status: 400 });
      slipKey = `slips/${orderId}/${crypto.randomUUID()}`;
      await UPLOADS.put(slipKey, slip.stream(), { httpMetadata: { contentType: slip.type }, customMetadata: { orderId } });
    }

    const status = slipKey ? "waiting_for_slip_review" : "waiting_for_payment_info";
    await DB.batch([
      DB.prepare("INSERT INTO orders (id, customer_name, phone, address, note, subtotal, shipping_fee, total, slip_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)")
        .bind(orderId, customerName, phone, address, note, subtotal, slipKey, status, now, now),
      ...items.map((item) => DB.prepare("INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)").bind(orderId, item.productId, item.name, item.quantity, item.unitPrice)),
    ]);

    return NextResponse.json({ orderId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึกออเดอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
