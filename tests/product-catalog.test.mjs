import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRODUCT_MEDIA_ORIGIN,
  PRODUCT_IMAGE_PLACEHOLDER,
  catalogProductsFromRows,
  isProductPurchasable,
  normalizeProductStatus,
  safeProductImageUrl,
} from "../lib/product-catalog.ts";

const mediaUrl = (name) => `${DEFAULT_PRODUCT_MEDIA_ORIGIN}/products/${name}`;

test("normalizes legacy status without destroying the old value", () => {
  assert.equal(normalizeProductStatus("หยุดขาย"), "ปิดชั่วคราว");
  assert.equal(normalizeProductStatus("เปิดขาย"), "เปิดขาย");
  assert.equal(normalizeProductStatus("ค่าที่ไม่รู้จัก"), "รอข้อมูล");
});

test("keeps sheet row order, hides hidden products, and downgrades incomplete rows", () => {
  const products = catalogProductsFromRows([
    ["รหัสสินค้า", "ชื่อสินค้า", "หน่วยขาย", "รายละเอียด", "ราคา", "สถานะ", "ไฟล์เดิม", "แก้ไข", "URL"],
    ["FIRST", "รายการแรก", "1 ชิ้น", "รายละเอียดแรก", "20", "เปิดขาย", "", "", mediaUrl("first-v1.jpg")],
    ["LEGACY", "รายการค่าเก่า", "1 แพ็ก", "รายละเอียดเดิม", "30", "หยุดขาย", "", "", mediaUrl("legacy-v1.jpg")],
    ["HIDDEN", "รายการซ่อน", "1 ชิ้น", "ไม่แสดง", "40", "ซ่อนสินค้า", "", "", mediaUrl("hidden-v1.jpg")],
    ["INCOMPLETE", "รายการข้อมูลไม่ครบ", "1 ชิ้น", "", "50", "เปิดขาย", "", "", mediaUrl("incomplete-v1.jpg")],
    ["BADIMAGE", "รายการรูปผิด", "1 ชิ้น", "รายละเอียด", "60", "เปิดขาย", "", "", "https://example.com/products/tracker.jpg"],
  ]);

  assert.deepEqual(products.map((product) => product.id), ["FIRST", "LEGACY", "INCOMPLETE", "BADIMAGE"]);
  assert.equal(products[1].status, "ปิดชั่วคราว");
  assert.equal(products[2].status, "รอข้อมูล");
  assert.equal(products[3].image, PRODUCT_IMAGE_PLACEHOLDER);
});

test("only allows HTTPS product paths from the configured R2 media origin", () => {
  assert.equal(safeProductImageUrl(mediaUrl("new-item-v1.jpg")), "/media/products/new-item-v1.jpg");
  assert.equal(safeProductImageUrl("http://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev/products/a.jpg"), PRODUCT_IMAGE_PLACEHOLDER);
  assert.equal(safeProductImageUrl(`${DEFAULT_PRODUCT_MEDIA_ORIGIN}/private/slip.jpg`), PRODUCT_IMAGE_PLACEHOLDER);
  assert.equal(safeProductImageUrl("https://example.com/products/a.jpg"), PRODUCT_IMAGE_PLACEHOLDER);
});

test("allows checkout only for an open product with a positive price", () => {
  assert.equal(isProductPurchasable({ status: "เปิดขาย", price: 50 }), true);
  assert.equal(isProductPurchasable({ status: "ปิดชั่วคราว", price: 50 }), false);
  assert.equal(isProductPurchasable({ status: "เปิดขาย", price: null }), false);
});
