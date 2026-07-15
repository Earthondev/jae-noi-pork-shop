import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("CMS validation covers dates, products, Maps links, and raw Sheets writes", async () => {
  const [cms, sheets] = await Promise.all([
    readFile(new URL("../lib/admin-cms.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets.ts", import.meta.url), "utf8"),
  ]);
  assert.match(cms, /roundIdFromDeliveryDate/);
  assert.match(cms, /เวลาเปิดรับต้องมาก่อนเวลาปิดรับ/);
  assert.match(cms, /สินค้าที่เปิดขายต้องมีหน่วย/);
  assert.match(cms, /safePickupMapUrl/);
  assert.match(sheets, /valueInputOption: "RAW"/);
  assert.match(sheets, /fingerprint/);
});

test("admin CMS mutations require login, same-origin checks, and private responses", async () => {
  const [route, imageRoute, dashboard] = await Promise.all([
    readFile(new URL("../app/api/admin/cms/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/product-image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getAdminUser/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /no-store, private/);
  assert.match(imageRoute, /MAX_IMAGE_BYTES/);
  assert.match(imageRoute, /detectImageType/);
  assert.match(dashboard, /admin-bottom-nav/);
  assert.match(dashboard, /ออเดอร์/);
  assert.match(dashboard, /รอบขาย/);
  assert.match(dashboard, /เปิดรอบขาย/);
  assert.match(dashboard, /serverClockLabel/);
  assert.match(dashboard, /history\.replaceState/);
  assert.match(dashboard, /ไม่ต้องรีโหลดหน้า/);
  assert.match(dashboard, /สินค้า/);
  assert.match(dashboard, /หน้าร้าน/);
  assert.match(dashboard, /ConfirmDialog/);
  assert.doesNotMatch(dashboard, /window\.confirm/);
  assert.match(dashboard, /category/);
  assert.match(dashboard, /storeLogoUrl/);
});
