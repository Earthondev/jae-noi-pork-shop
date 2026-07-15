import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSecureOrderId, deliveryDateKeyFromRoundId } from "../lib/order-id.ts";
import { paymentDecisionFromVerification } from "../lib/order-workflow.ts";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps payment and fulfilment statuses separated", async () => {
  const [orderRoute, workflow, sheets, admin] = await Promise.all([
    projectFile("app/api/orders/route.ts"),
    projectFile("lib/order-workflow.ts"),
    projectFile("lib/google-sheets.ts"),
    projectFile("app/admin/dashboard.tsx"),
  ]);

  assert.doesNotMatch(`${orderRoute}\n${workflow}\n${sheets}\n${admin}`, /รอข้อมูลชำระเงิน/);
  assert.match(workflow, /paymentStatus: "ชำระแล้ว"/);
  assert.match(workflow, /paymentStatus: "สลิปไม่ถูกต้อง"/);
  assert.doesNotMatch(orderRoute, /orderStatus = "ชำระแล้ว"/);
  assert.match(orderRoute, /orderStatus: "received"/);
  assert.match(admin, /payment_status/);
  assert.match(admin, /order_status/);
});

test("writes an order atomically to D1 and carries a stable idempotency key", async () => {
  const [shop, orderRoute, repository] = await Promise.all([
    projectFile("app/shop.tsx"),
    projectFile("app/api/orders/route.ts"),
    projectFile("db/order-repository.ts"),
  ]);

  assert.match(shop, /idempotencyKey/);
  assert.match(orderRoute, /idempotencyKey/);
  assert.match(repository, /idempotencyKey/);
  assert.match(repository, /db\.batch/);
  assert.match(orderRoute, /insertOrder/);
});

test("shows the next opening and blocks pickup until an address exists", async () => {
  // "nextRound" copy and the pickup-disabled control now live in the extracted
  // Hero / CartDrawer components rather than the shop.tsx container itself.
  const [shop, hero, cartDrawer, sheets, orderRoute] = await Promise.all([
    projectFile("app/shop.tsx"),
    projectFile("app/_components/shop/hero.tsx"),
    projectFile("app/_components/shop/cart-drawer.tsx"),
    projectFile("lib/google-sheets.ts"),
    projectFile("app/api/orders/route.ts"),
  ]);
  const shopAndComponents = `${shop}\n${hero}\n${cartDrawer}`;

  assert.match(shopAndComponents, /nextRound/);
  assert.match(shopAndComponents, /รอบถัดไปเปิดวันที่/);
  assert.match(cartDrawer, /disabled={!storefront\.pickupAddress}/);
  assert.match(sheets, /nextRound/);
  assert.match(orderRoute, /ไม่สามารถรับเองหน้าร้านได้จนกว่าจะมีที่อยู่ร้าน/);
});

test("builds the order number from the selected delivery round", async () => {
  assert.equal(deliveryDateKeyFromRoundId("RD-20260716"), "20260716");
  assert.throws(() => deliveryDateKeyFromRoundId("RD-2026-07-16"), /รหัสรอบจัดส่ง/);

  const orderId = await createSecureOrderId("RD-20260716", "4e1ad4c1-e66e-4202-b9bc-c2018e503c80");
  assert.match(orderId, /^JN-20260716-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
});

test("keeps a rejected SlipOK result as an invalid-slip order", () => {
  assert.deepEqual(
    paymentDecisionFromVerification({ status: "rejected", reason: "ยอดเงินในสลิปไม่ตรงกับยอดคำสั่งซื้อ" }),
    {
      paymentStatus: "สลิปไม่ถูกต้อง",
      clientPaymentStatus: "invalid",
      adminNote: "SlipOK ไม่ผ่าน · ยอดเงินในสลิปไม่ตรงกับยอดคำสั่งซื้อ",
    },
  );
});

test("separates verified, pending, and disabled SlipOK outcomes", () => {
  assert.deepEqual(
    paymentDecisionFromVerification({
      status: "verified",
      transactionReference: "REF-001",
      verifiedAt: "2026-07-13T13:00:00.000Z",
      senderName: "ลูกค้า",
    }),
    {
      paymentStatus: "ชำระแล้ว",
      clientPaymentStatus: "verified",
      adminNote: "SlipOK ยืนยันแล้ว · Ref REF-001 · 2026-07-13T13:00:00.000Z",
    },
  );
  assert.equal(paymentDecisionFromVerification({ status: "pending", reason: "รอตรวจ" }).paymentStatus, "รอตรวจสลิป");
  assert.equal(paymentDecisionFromVerification({ status: "disabled" }).paymentStatus, "รอตรวจสลิป");
});

test("prevents fulfilment progress until payment is confirmed", async () => {
  const [repository, adminRoute, admin] = await Promise.all([
    projectFile("db/order-repository.ts"),
    projectFile("app/api/admin/orders/[id]/route.ts"),
    projectFile("app/admin/dashboard.tsx"),
  ]);

  assert.match(repository, /effectivePaymentStatus !== "paid"/);
  assert.match(repository, /return "payment_required"/);
  assert.match(adminRoute, /result === "payment_required"/);
  assert.match(admin, /order\.payment_status !== "paid"/);
  assert.match(admin, /order_status: patch\.orderStatus/);
});

test("revalidates product availability with product-specific messages", async () => {
  const [orderRoute, sheets] = await Promise.all([
    projectFile("app/api/orders/route.ts"),
    projectFile("lib/google-sheets.ts"),
  ]);

  assert.match(sheets, /สินค้า!A:J/);
  assert.match(orderRoute, /product\.status === "ปิดชั่วคราว"/);
  assert.match(orderRoute, /\$\{product\.name\} ปิดรับชั่วคราว/);
  assert.doesNotMatch(orderRoute, /ไส้กรอกอีสานยังรอข้อมูลราคา/);
});
