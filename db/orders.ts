import { env } from "cloudflare:workers";

type RuntimeBindings = { DB?: D1Database; UPLOADS?: R2Bucket };

export type PaymentStatus = "waiting_for_payment" | "waiting_for_slip_review" | "paid" | "invalid_slip" | "refunded";
export type OrderStatus = "received" | "preparing" | "ready_for_pickup" | "shipped" | "completed" | "cancelled";

export type AdminOrder = {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  note: string;
  admin_note: string;
  subtotal: number;
  shipping_fee: number | null;
  total: number | null;
  slip_key: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  items: string;
};

export function getBindings(): { DB: D1Database; UPLOADS: R2Bucket } {
  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB || !bindings.UPLOADS) throw new Error("ระบบจัดเก็บข้อมูลยังไม่พร้อมใช้งาน");
  return { DB: bindings.DB, UPLOADS: bindings.UPLOADS };
}

export async function ensureOrderSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL,
      shipping_fee INTEGER,
      total INTEGER,
      slip_key TEXT,
      status TEXT NOT NULL DEFAULT 'waiting_for_payment_info',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id)"),
  ]);
}

export function createOrderId(): string {
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `JN-${day}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}
