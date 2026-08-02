import type { AdminOrder } from "../db/orders";

export type SalesBreakdown = Readonly<{
  /** Orders counted into the money figures below. */
  paidOrders: number;
  /** Goods only, i.e. what the shop actually sold. */
  goods: number;
  /** Postage collected — money that passes through rather than margin. */
  shipping: number;
  /** goods + shipping, the figure that used to be the only one shown. */
  total: number;
}>;

export type ProductSales = Readonly<{
  name: string;
  quantity: number;
  revenue: number;
}>;

// Cancelled orders keep their rows but must never count as sales, and an
// unpaid order is a promise rather than money. Both money and best-seller
// figures use this same basis so the two blocks always reconcile.
export function countsAsSale(order: Pick<AdminOrder, "payment_status" | "order_status">): boolean {
  return order.payment_status === "paid" && order.order_status !== "cancelled";
}

export function salesBreakdown(orders: readonly AdminOrder[]): SalesBreakdown {
  let paidOrders = 0;
  let goods = 0;
  let shipping = 0;
  for (const order of orders) {
    if (!countsAsSale(order)) continue;
    paidOrders += 1;
    goods += order.subtotal ?? 0;
    shipping += order.shipping_fee ?? 0;
  }
  return { paidOrders, goods, shipping, total: goods + shipping };
}

/**
 * Units and revenue per product across the given orders, best seller first.
 * Ties break on revenue then name so the list order is stable between renders
 * rather than shuffling on every refresh.
 */
export function productSales(orders: readonly AdminOrder[], limit = 10): ProductSales[] {
  const totals = new Map<string, { quantity: number; revenue: number }>();
  for (const order of orders) {
    if (!countsAsSale(order)) continue;
    for (const line of order.item_lines ?? []) {
      const name = line.name?.trim() || "ไม่ระบุสินค้า";
      const current = totals.get(name) ?? { quantity: 0, revenue: 0 };
      current.quantity += line.quantity ?? 0;
      current.revenue += (line.quantity ?? 0) * (line.unitPrice ?? 0);
      totals.set(name, current);
    }
  }
  return Array.from(totals, ([name, value]) => ({ name, ...value }))
    .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue || left.name.localeCompare(right.name, "th"))
    .slice(0, Math.max(0, limit));
}
