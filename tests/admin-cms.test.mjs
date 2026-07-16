import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AdminCmsValidationError, cleanStorefrontSettings, validateProductInput } from "../lib/admin-cms.ts";
import { DEFAULT_STORE_COVER, DEFAULT_STORE_LOGO } from "../lib/product-catalog.ts";
test("CMS validation covers dates, products, and Maps links", async () => {
  const cms = await readFile(new URL("../lib/admin-cms.ts", import.meta.url), "utf8");
  assert.match(cms, /roundIdFromDeliveryDate/);
  assert.match(cms, /เวลาเปิดรับต้องมาก่อนเวลาปิดรับ/);
  assert.match(cms, /สินค้าที่เปิดขายต้องมีหน่วย/);
  assert.match(cms, /safePickupMapUrl/);
});

test("storefront settings accept only the bundled brand defaults or approved uploaded assets", () => {
  const settings = {
    storeName: "เจ๊น้อย เขียงหมูตะคร้อ",
    heroTitle: "อร่อยถึงเครื่อง",
    heroHighlight: "สั่งง่ายถึงบ้าน",
    heroDescription: "คำแนะนำร้าน",
    announcementText: "ข้อความประกาศ",
    storyTitle: "เรื่องของร้าน",
    storyDescription: "รายละเอียดร้าน",
    phonePrimary: "087-2416773",
    phoneSecondary: "087-8755479",
    shippingFee: 50,
    pickupAddress: "หน้าร้าน",
    pickupMapUrl: "https://maps.app.goo.gl/uVChd79bzjbXYwtXA",
    storeLogoUrl: DEFAULT_STORE_LOGO,
    storeCoverUrl: DEFAULT_STORE_COVER,
  };

  assert.deepEqual(cleanStorefrontSettings(settings), settings);
  assert.throws(
    () => cleanStorefrontSettings({ ...settings, storeLogoUrl: "/images/unapproved-logo.jpg" }),
    /โลโก้ต้องมาจากพื้นที่รูปของร้านเท่านั้น/,
  );
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
  assert.match(route, /AdminCmsValidationError/);
  assert.match(imageRoute, /MAX_IMAGE_BYTES/);
  assert.match(imageRoute, /detectSupportedImageType/);
  assert.match(dashboard, /admin-drawer/);
  assert.match(dashboard, /ออเดอร์/);
  assert.match(dashboard, /รอบขาย/);
  assert.match(dashboard, /เปิดรอบขาย/);
  assert.match(dashboard, /serverClockLabel/);
  assert.match(dashboard, /history\.replaceState/);
  assert.match(dashboard, /ไม่ต้องรีโหลดหน้า/);
  assert.match(dashboard, /ยอดชำระแล้วรอบนี้/);
  assert.match(dashboard, /order\.payment_status === "paid"/);
  assert.match(dashboard, /สินค้า/);
  assert.match(dashboard, /หน้าร้าน/);
  assert.match(dashboard, /ConfirmDialog/);
  assert.doesNotMatch(dashboard, /window\.confirm/);
  assert.match(dashboard, /category/);
  assert.match(dashboard, /storeLogoUrl/);
});

test("CMS domain validation is returned as an input error instead of an outage", () => {
  assert.throws(
    () => validateProductInput({ id: "P1", name: "สินค้า", unit: "", detail: "", price: null, status: "เปิดขาย", imageUrl: "", category: "อื่น ๆ" }),
    AdminCmsValidationError,
  );
});

test("admin order query limits item reads to the visible 500 orders", async () => {
  const repository = await readFile(new URL("../db/order-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /INNER JOIN \(SELECT id FROM orders ORDER BY created_at DESC LIMIT 500\)/);
  assert.doesNotMatch(repository, /FROM order_items ORDER BY id/);
});
