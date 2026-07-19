import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSupportedImageType,
  validateOrderRequestFields,
  validateOrderItemInputs,
} from "../lib/order-request-validation.ts";

test("order fields have explicit storage-safe length limits", () => {
  assert.doesNotThrow(() => validateOrderRequestFields({ customerName: "คุณเอ", note: "ฝากไว้หน้าบ้าน" }));
  assert.throws(
    () => validateOrderRequestFields({ customerName: "ก".repeat(101), note: "" }),
    /ชื่อลูกค้ายาวเกินไป/,
  );
  assert.throws(
    () => validateOrderRequestFields({ customerName: "คุณเอ", note: "ก".repeat(501) }),
    /หมายเหตุยาวเกินไป/,
  );
});

test("order item payload rejects duplicate products and oversized arrays", () => {
  assert.deepEqual(validateOrderItemInputs([{ productId: "P1", quantity: 2 }]), [{ productId: "P1", quantity: 2 }]);
  assert.throws(
    () => validateOrderItemInputs([{ productId: "P1", quantity: 1 }, { productId: "P1", quantity: 2 }]),
    /สินค้าซ้ำ/,
  );
  assert.throws(
    () => validateOrderItemInputs(Array.from({ length: 51 }, (_, index) => ({ productId: `P${index}`, quantity: 1 }))),
    /สินค้าในตะกร้ามากเกินไป/,
  );
});

test("slip uploads are identified from bytes rather than client MIME only", () => {
  assert.equal(detectSupportedImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))?.contentType, "image/jpeg");
  assert.equal(detectSupportedImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType, "image/png");
  assert.equal(detectSupportedImageType(new TextEncoder().encode("<script>alert(1)</script>")), null);
});
