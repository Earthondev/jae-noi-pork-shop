import { env } from "cloudflare:workers";
import type { AdminOrder, OrderStatus, PaymentStatus } from "./orders";
import { maskPhone, matchesPhoneLast4, normalizePhone, type PublicOrderTracking } from "../lib/order-tracking";
import { carrierLabel, carrierTrackingUrl, isCarrierCode, type CarrierCode } from "../lib/carriers";
import { canReuploadSlip, MAX_SLIP_RETRIES, mustContactShop } from "../lib/slip-retry";

const AUTO_COMPLETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
  carrierCode?: CarrierCode | null;
};

export type UpdateOrderStatusResult = "updated" | "not_found" | "payment_required";
export type ConfirmReceivedResult = "updated" | "not_found" | "not_eligible";

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
  slip_retries_used: number;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  created_at: string;
  updated_at: string;
  fulfilment: "pickup" | "postal";
  tracking_number: string | null;
  carrier_code: string | null;
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

/**
 * Orders left "shipped"/"ready_for_pickup" for AUTO_COMPLETE_AFTER_MS with no
 * customer confirmation get auto-flipped to "completed". Runs lazily on read
 * (no Cron Trigger needed) — called from both the customer tracking lookup
 * and the admin order list.
 */
export async function autoCompleteOverdueOrders(now: Date = new Date()): Promise<void> {
  const db = database();
  const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS).toISOString();
  await db.prepare(
    `UPDATE orders SET order_status = 'completed', updated_at = ?
     WHERE order_status IN ('shipped', 'ready_for_pickup') AND shipped_at IS NOT NULL AND shipped_at <= ?`,
  ).bind(now.toISOString(), cutoff).run();
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  await autoCompleteOverdueOrders();
  const db = database();
  const [ordersResult, itemsResult] = await db.batch([
    db.prepare(`SELECT id, round_id, customer_name, phone, address, note, admin_note, subtotal,
      shipping_fee, total, slip_key, payment_status, order_status, created_at, fulfilment, tracking_number, carrier_code
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
    carrier_code: isCarrierCode(row.carrier_code) ? row.carrier_code : null,
    items: (itemsByOrder.get(row.id) ?? []).map((item) => `${item.name} × ${item.quantity}`).join(", "),
    item_lines: (itemsByOrder.get(row.id) ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
    })),
  }));
}

export async function countRecentOrdersByPhone(phone: string, sinceIso: string): Promise<number> {
  const db = database();
  const result = await db.prepare(
    `SELECT COUNT(*) as count FROM orders WHERE phone_normalized = ? AND created_at >= ?`,
  ).bind(normalizePhone(phone), sinceIso).first<{ count: number }>();
  return result?.count ?? 0;
}

export async function getPublicOrderByIdAndPhoneLast4(
  orderId: string,
  phoneLast4: string,
  options: { now?: Date; days?: number } = {},
): Promise<PublicOrderTracking | null> {
  const now = options.now ?? new Date();
  await autoCompleteOverdueOrders(now);
  const db = database();
  const days = Math.max(1, Math.min(options.days ?? 30, 31));
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const futureLimit = new Date(now.getTime() + 5 * 60_000).toISOString();
  const row = await db.prepare(`SELECT id, round_id, customer_name, phone, address, note, admin_note,
    subtotal, shipping_fee, total, slip_key, slip_retries_used, payment_status, order_status, created_at, updated_at,
    fulfilment, tracking_number, carrier_code, delivery_date
    FROM orders WHERE id = ? AND created_at >= ? AND created_at <= ? LIMIT 1`)
    .bind(orderId, cutoff, futureLimit).first<OrderRow>();
  if (!row || !matchesPhoneLast4(row.phone, phoneLast4)) return null;
  const itemsResult = await db.prepare(
    "SELECT order_id, name, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY id",
  ).bind(row.id).all<ItemRow>();
  return toPublicOrder(row, itemsResult.results);
}

export async function updateAdminOrder(id: string, patch: AdminOrderPatch): Promise<UpdateOrderStatusResult> {
  const db = database();
  const current = await db.prepare(
    "SELECT payment_status AS paymentStatus, shipped_at AS shippedAt FROM orders WHERE id = ? LIMIT 1",
  ).bind(id).first<{ paymentStatus: PaymentStatus; shippedAt: string | null }>();
  if (!current) return "not_found";
  const effectivePaymentStatus = patch.paymentStatus ?? current.paymentStatus;
  const canAdvanceWithoutPayment = !patch.orderStatus || patch.orderStatus === "received" || patch.orderStatus === "cancelled";
  if ((!canAdvanceWithoutPayment || patch.trackingNumber?.trim()) && effectivePaymentStatus !== "paid") {
    return "payment_required";
  }
  const assignments: string[] = [];
  const values: Array<string | null> = [];
  if (patch.paymentStatus) { assignments.push("payment_status = ?"); values.push(patch.paymentStatus); }
  if (patch.orderStatus) {
    assignments.push("order_status = ?"); values.push(patch.orderStatus);
    // First time entering a "customer can now receive it" state starts the
    // auto-complete clock; re-saving the same status later (e.g. correcting
    // the tracking number) must not reset it.
    if ((patch.orderStatus === "shipped" || patch.orderStatus === "ready_for_pickup") && !current.shippedAt) {
      assignments.push("shipped_at = ?"); values.push(new Date().toISOString());
    }
  }
  if (patch.trackingNumber !== undefined) { assignments.push("tracking_number = ?"); values.push(patch.trackingNumber.trim() || null); }
  if (patch.carrierCode !== undefined) { assignments.push("carrier_code = ?"); values.push(patch.carrierCode); }
  if (assignments.length === 0) return "updated";
  assignments.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  await db.prepare(`UPDATE orders SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
  return "updated";
}

export async function confirmOrderReceivedByPhoneLast4(orderId: string, phoneLast4: string): Promise<ConfirmReceivedResult> {
  const db = database();
  const current = await db.prepare(
    "SELECT phone AS phone, order_status AS orderStatus FROM orders WHERE id = ? LIMIT 1",
  ).bind(orderId).first<{ phone: string; orderStatus: OrderStatus }>();
  if (!current || !matchesPhoneLast4(current.phone, phoneLast4)) return "not_found";
  if (current.orderStatus !== "shipped" && current.orderStatus !== "ready_for_pickup") return "not_eligible";
  await db.prepare("UPDATE orders SET order_status = 'completed', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), orderId).run();
  return "updated";
}

export type SlipReuploadTarget = { orderId: string; total: number; slipKey: string | null };
export type SlipReuploadLookup = SlipReuploadTarget | "not_found" | "not_eligible";

/**
 * Reads the order a customer is trying to re-attach a slip to. The eligibility
 * answer here is advisory — the retry is only really claimed by
 * `applySlipReupload`, whose WHERE clause re-checks the same conditions so two
 * uploads racing each other cannot both spend the single attempt.
 */
export async function findOrderForSlipReupload(orderId: string, phoneLast4: string): Promise<SlipReuploadLookup> {
  const row = await database().prepare(
    `SELECT phone, total, slip_key AS slipKey, payment_status AS paymentStatus, slip_retries_used AS slipRetriesUsed
     FROM orders WHERE id = ? LIMIT 1`,
  ).bind(orderId).first<{ phone: string; total: number; slipKey: string | null; paymentStatus: PaymentStatus; slipRetriesUsed: number }>();
  if (!row || !matchesPhoneLast4(row.phone, phoneLast4)) return "not_found";
  if (!canReuploadSlip({ paymentStatus: row.paymentStatus, slipRetriesUsed: row.slipRetriesUsed })) return "not_eligible";
  return { orderId, total: row.total, slipKey: row.slipKey };
}

/**
 * Spends the retry and records the new verification outcome in one statement.
 * Returns false when the guard no longer holds — the order was paid, reviewed,
 * or already retried between the lookup and here.
 */
export async function applySlipReupload(
  orderId: string,
  update: { slipKey: string; paymentStatus: PaymentStatus; adminNote: string },
): Promise<boolean> {
  const result = await database().prepare(
    `UPDATE orders
     SET slip_key = ?, payment_status = ?, admin_note = ?, slip_retries_used = slip_retries_used + 1, updated_at = ?
     WHERE id = ? AND payment_status = 'invalid_slip' AND slip_retries_used < ?`,
  ).bind(update.slipKey, update.paymentStatus, update.adminNote, new Date().toISOString(), orderId, MAX_SLIP_RETRIES).run();
  return (result.meta?.changes ?? 0) > 0;
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
    canReuploadSlip: canReuploadSlip({ paymentStatus: row.payment_status, slipRetriesUsed: row.slip_retries_used }),
    mustContactShop: mustContactShop({ paymentStatus: row.payment_status, slipRetriesUsed: row.slip_retries_used }),
    trackingNumber: row.tracking_number,
    carrierCode: isCarrierCode(row.carrier_code) ? row.carrier_code : null,
    carrierLabel: isCarrierCode(row.carrier_code) ? carrierLabel(row.carrier_code) : null,
    trackingUrl: isCarrierCode(row.carrier_code) ? carrierTrackingUrl(row.carrier_code, row.tracking_number) : null,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.quantity * item.unit_price,
    })),
  };
}
