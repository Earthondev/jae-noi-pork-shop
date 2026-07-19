import { env } from "cloudflare:workers";
import type { AdminOrder, OrderStatus, PaymentStatus } from "./orders";
import { maskPhone, normalizePhone, type PublicOrderTracking } from "../lib/order-tracking";

type RuntimeBindings = { DB?: D1Database };

export type NewOrderRecord = {
  id: string;
  roundId: string;
  deliveryDate: string;
  createdAt: string;
  customerName: string;
  phone: string;
  fulfilment: "pickup" | "postal";
  address: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  slipKey: string | null;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  adminNote: string;
  note: string;
  idempotencyKey: string;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number }>;
};

export type AdminOrderPatch = {
  paymentStatus?: PaymentStatus;
  orderStatus?: OrderStatus;
  trackingNumber?: string;
};

export type UpdateOrderStatusResult = "updated" | "not_found" | "payment_required";

type OrderRow = {
  id: string;
  round_id: string;
  customer_name: string;
  phone: string;
  address: string;
  note: string;
  admin_note: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  slip_key: string | null;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  updated_at: string;
  fulfilment: "pickup" | "postal";
  tracking_number: string | null;
  delivery_date: string;
};

type ItemRow = {
  order_id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

function database(): D1Database {
  const db = (env as unknown as RuntimeBindings).DB;
  if (!db) throw new Error("Cloudflare D1 binding `DB` is unavailable");
  return db;
}

export async function insertOrder(order: NewOrderRecord): Promise<void> {
  const db = database();
  const orderStatement = db.prepare(`INSERT INTO orders (
    id, round_id, delivery_date, customer_name, phone, phone_normalized, fulfilment, address,
    address_line, subdistrict, district, province, postal_code, note, admin_note,
    subtotal, shipping_fee, total, slip_key, payment_status, order_status, tracking_number,
    idempotency_key, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
    .bind(
      order.id, order.roundId, order.deliveryDate, order.customerName, order.phone, normalizePhone(order.phone), order.fulfilment,
      order.address, order.addressLine, order.subdistrict, order.district, order.province, order.postalCode,
      order.note, order.adminNote, order.subtotal, order.shippingFee, order.total, order.slipKey,
      order.paymentStatus, order.orderStatus, order.idempotencyKey, order.createdAt, order.createdAt,
    );
  const itemStatements = order.items.map((item) => db.prepare(`INSERT INTO order_items (
    order_id, product_id, name, quantity, unit_price
  ) VALUES (?, ?, ?, ?, ?)`).bind(order.id, item.id, item.name, item.quantity, item.unitPrice));
  await db.batch([orderStatement, ...itemStatements]);
}

export async function findOrderByIdempotencyKey(
  idempotencyKey: string,
): Promise<{ orderId: string; paymentStatus: PaymentStatus } | null> {
  return database().prepare(
    "SELECT id AS orderId, payment_status AS paymentStatus FROM orders WHERE idempotency_key = ? LIMIT 1",
  ).bind(idempotencyKey).first<{ orderId: string; paymentStatus: PaymentStatus }>();
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const db = database();
  const [ordersResult, itemsResult] = await db.batch([
    db.prepare(`SELECT id, round_id, customer_name, phone, address, note, admin_note, subtotal,
      shipping_fee, total, slip_key, payment_status, order_status, created_at, fulfilment, tracking_number
      FROM orders ORDER BY created_at DESC LIMIT 500`),
    db.prepare(`SELECT oi.order_id, oi.name, oi.quantity, oi.unit_price
      FROM order_items oi
      INNER JOIN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 500) recent ON recent.id = oi.order_id
      ORDER BY oi.id`),
  ]);
  const itemsByOrder = groupItems(itemsResult.results as unknown as ItemRow[]);
  return (ordersResult.results as unknown as OrderRow[]).map((row) => ({
    id: row.id,
    round_id: row.round_id,
    customer_name: row.customer_name,
    phone: row.phone,
    address: row.address,
    note: row.note,
    admin_note: row.admin_note,
    subtotal: row.subtotal,
    shipping_fee: row.shipping_fee,
    total: row.total,
    slip_key: row.slip_key,
    payment_status: row.payment_status,
    order_status: row.order_status,
    created_at: row.created_at,
    fulfilment: row.fulfilment,
    tracking_number: row.tracking_number,
    items: (itemsByOrder.get(row.id) ?? []).map((item) => `${item.name} × ${item.quantity}`).join(", "),
  }));
}

export async function getPublicOrdersByPhone(
  phone: string,
  options: { now?: Date; days?: number; limit?: number } = {},
): Promise<PublicOrderTracking[]> {
  const db = database();
  const now = options.now ?? new Date();
  const days = Math.max(1, Math.min(options.days ?? 30, 31));
  const limit = Math.max(1, Math.min(options.limit ?? 10, 10));
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const futureLimit = new Date(now.getTime() + 5 * 60_000).toISOString();
  const ordersResult = await db.prepare(`SELECT id, round_id, customer_name, phone, address, note, admin_note,
    subtotal, shipping_fee, total, slip_key, payment_status, order_status, created_at, updated_at,
    fulfilment, tracking_number, delivery_date
    FROM orders WHERE phone_normalized = ? AND created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC LIMIT ?`)
    .bind(normalizePhone(phone), cutoff, futureLimit, limit).all<OrderRow>();
  const rows = ordersResult.results;
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const itemsResult = await db.prepare(
    `SELECT order_id, name, quantity, unit_price FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`,
  ).bind(...rows.map((row) => row.id)).all<ItemRow>();
  const itemsByOrder = groupItems(itemsResult.results);
  return rows.map((row) => toPublicOrder(row, itemsByOrder.get(row.id) ?? []));
}

export async function updateAdminOrder(id: string, patch: AdminOrderPatch): Promise<UpdateOrderStatusResult> {
  const db = database();
  const current = await db.prepare(
    "SELECT payment_status AS paymentStatus FROM orders WHERE id = ? LIMIT 1",
  ).bind(id).first<{ paymentStatus: PaymentStatus }>();
  if (!current) return "not_found";
  const effectivePaymentStatus = patch.paymentStatus ?? current.paymentStatus;
  const canAdvanceWithoutPayment = !patch.orderStatus || patch.orderStatus === "received" || patch.orderStatus === "cancelled";
  if ((!canAdvanceWithoutPayment || patch.trackingNumber?.trim()) && effectivePaymentStatus !== "paid") {
    return "payment_required";
  }
  const assignments: string[] = [];
  const values: Array<string | null> = [];
  if (patch.paymentStatus) { assignments.push("payment_status = ?"); values.push(patch.paymentStatus); }
  if (patch.orderStatus) { assignments.push("order_status = ?"); values.push(patch.orderStatus); }
  if (patch.trackingNumber !== undefined) { assignments.push("tracking_number = ?"); values.push(patch.trackingNumber.trim() || null); }
  if (assignments.length === 0) return "updated";
  assignments.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  await db.prepare(`UPDATE orders SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
  return "updated";
}

export async function getOrderSlipKey(id: string): Promise<string | null> {
  const result = await database().prepare("SELECT slip_key AS slipKey FROM orders WHERE id = ? LIMIT 1")
    .bind(id).first<{ slipKey: string | null }>();
  return result?.slipKey ?? null;
}

function groupItems(items: ItemRow[]): Map<string, ItemRow[]> {
  const grouped = new Map<string, ItemRow[]>();
  for (const item of items) grouped.set(item.order_id, [...(grouped.get(item.order_id) ?? []), item]);
  return grouped;
}

function toPublicOrder(row: OrderRow, items: ItemRow[]): PublicOrderTracking {
  return {
    orderId: row.id,
    maskedPhone: maskPhone(row.phone),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    deliveryDate: row.delivery_date,
    fulfilment: row.fulfilment,
    fulfilmentLabel: row.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "จัดส่งไปรษณีย์ · ซ่อนที่อยู่เพื่อความเป็นส่วนตัว",
    subtotal: row.subtotal,
    shippingFee: row.shipping_fee,
    total: row.total,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    trackingNumber: row.tracking_number,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.quantity * item.unit_price,
    })),
  };
}
