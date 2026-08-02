import assert from "node:assert/strict";
import test from "node:test";
import { countsAsSale, productSales, salesBreakdown } from "../lib/order-sales-summary.ts";

function order(overrides) {
  return {
    id: "JN-20260721-AAAAAAAAAA",
    payment_status: "paid",
    order_status: "completed",
    subtotal: 100,
    shipping_fee: 50,
    total: 150,
    item_lines: [{ name: "แหนมหมู", quantity: 1, unitPrice: 100 }],
    ...overrides,
  };
}

test("shipping is separated from what the shop actually sold", () => {
  const result = salesBreakdown([
    order({ subtotal: 200, shipping_fee: 50, total: 250 }),
    order({ subtotal: 300, shipping_fee: 0, total: 300 }),
  ]);
  assert.equal(result.goods, 500);
  assert.equal(result.shipping, 50);
  assert.equal(result.total, 550, "total must still reconcile with goods + shipping");
  assert.equal(result.paidOrders, 2);
});

test("unpaid and cancelled orders never count as sales", () => {
  assert.equal(countsAsSale(order({ payment_status: "waiting_for_slip_review" })), false);
  assert.equal(countsAsSale(order({ order_status: "cancelled" })), false);
  assert.equal(countsAsSale(order()), true);

  const result = salesBreakdown([
    order({ payment_status: "invalid_slip", subtotal: 999, shipping_fee: 999 }),
    // A cancelled order that was paid still must not inflate the figures.
    order({ order_status: "cancelled", subtotal: 999, shipping_fee: 999 }),
    order({ subtotal: 100, shipping_fee: 50 }),
  ]);
  assert.deepEqual(result, { paidOrders: 1, goods: 100, shipping: 50, total: 150 });
});

test("a missing shipping fee is treated as zero rather than poisoning the total", () => {
  const result = salesBreakdown([order({ subtotal: 100, shipping_fee: null, total: null })]);
  assert.equal(result.shipping, 0);
  assert.equal(result.total, 100);
});

test("best sellers rank by units and carry their own revenue", () => {
  const result = productSales([
    order({ item_lines: [{ name: "แหนมหมู", quantity: 2, unitPrice: 50 }, { name: "แคปหมู", quantity: 5, unitPrice: 20 }] }),
    order({ item_lines: [{ name: "แหนมหมู", quantity: 3, unitPrice: 50 }] }),
    // Excluded, so its 99 units must not reach the ranking.
    order({ order_status: "cancelled", item_lines: [{ name: "ไส้กรอก", quantity: 99, unitPrice: 10 }] }),
  ]);
  assert.deepEqual(result, [
    { name: "แหนมหมู", quantity: 5, revenue: 250 },
    { name: "แคปหมู", quantity: 5, revenue: 100 },
  ], "equal units put the higher-earning product first, and excluded orders stay out");
});

test("the ranking is capped and survives orders with no line items", () => {
  const many = Array.from({ length: 15 }, (_, index) =>
    order({ item_lines: [{ name: `สินค้า ${index}`, quantity: index + 1, unitPrice: 10 }] }));
  assert.equal(productSales(many).length, 10);
  assert.equal(productSales(many, 3).length, 3);
  assert.deepEqual(productSales([order({ item_lines: undefined })]), []);
});
