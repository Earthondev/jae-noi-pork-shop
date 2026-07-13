import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps payment and fulfilment statuses separated", async () => {
  const [orderRoute, sheets, admin] = await Promise.all([
    projectFile("app/api/orders/route.ts"),
    projectFile("lib/google-sheets.ts"),
    projectFile("app/admin/dashboard.tsx"),
  ]);

  assert.doesNotMatch(`${orderRoute}\n${sheets}\n${admin}`, /รอข้อมูลชำระเงิน/);
  assert.match(orderRoute, /paymentStatus = "ชำระแล้ว"/);
  assert.doesNotMatch(orderRoute, /orderStatus = "ชำระแล้ว"/);
  assert.match(orderRoute, /orderStatus = "รับออเดอร์แล้ว"/);
  assert.match(admin, /payment_status/);
  assert.match(admin, /order_status/);
});

test("writes an order atomically and carries a stable idempotency key", async () => {
  const [shop, orderRoute, sheets] = await Promise.all([
    projectFile("app/shop.tsx"),
    projectFile("app/api/orders/route.ts"),
    projectFile("lib/google-sheets.ts"),
  ]);

  assert.match(shop, /idempotencyKey/);
  assert.match(orderRoute, /idempotencyKey/);
  assert.match(sheets, /idempotencyKey/);
  assert.match(sheets, /:batchUpdate/);
  assert.match(sheets, /insertDimension/);
  assert.doesNotMatch(sheets, /async function appendValues/);
});

test("shows the next opening and blocks pickup until an address exists", async () => {
  const [shop, sheets, orderRoute] = await Promise.all([
    projectFile("app/shop.tsx"),
    projectFile("lib/google-sheets.ts"),
    projectFile("app/api/orders/route.ts"),
  ]);

  assert.match(shop, /nextRound/);
  assert.match(shop, /รอบถัดไปเปิดวันที่/);
  assert.match(shop, /disabled={!pickupAddress}/);
  assert.match(sheets, /nextRound/);
  assert.match(orderRoute, /ไม่สามารถรับเองหน้าร้านได้จนกว่าจะมีที่อยู่ร้าน/);
});
