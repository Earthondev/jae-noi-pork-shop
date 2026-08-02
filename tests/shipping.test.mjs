import assert from "node:assert/strict";
import test from "node:test";
import { amountUntilFreeShipping, postalShippingCost } from "../lib/shipping.ts";

test("postal shipping applies the threshold only when the promotion is enabled", () => {
  const promotion = { shippingFee: 50, freeShippingMinimum: 300 };
  assert.equal(postalShippingCost(299, promotion), 50);
  assert.equal(postalShippingCost(300, promotion), 0);
  assert.equal(postalShippingCost(450, promotion), 0);
  assert.equal(amountUntilFreeShipping(299, promotion.freeShippingMinimum), 1);
});

test("postal shipping stays paid when free shipping is disabled", () => {
  assert.equal(postalShippingCost(999, { shippingFee: 50, freeShippingMinimum: null }), 50);
  assert.equal(amountUntilFreeShipping(999, null), null);
});

test("shipping remains safe with an older storefront snapshot that lacks the promotion field", () => {
  assert.equal(postalShippingCost(999, { shippingFee: 50, freeShippingMinimum: undefined }), 50);
  assert.equal(amountUntilFreeShipping(999, undefined), null);
});
