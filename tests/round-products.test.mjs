import assert from "node:assert/strict";
import test from "node:test";
import { AdminCmsValidationError, validateRoundInput } from "../lib/admin-cms.ts";
import {
  normalizeRoundProductScope,
  openRoundProductIdSet,
  roundIncludesProduct,
  roundProductIdSet,
} from "../lib/round-products.ts";

const wholeShop = { productScope: "all", productIds: [] };
const naemOnly = { productScope: "selected", productIds: ["NAEM", "NAEM-XL"] };
const kaepOnly = { productScope: "selected", productIds: ["KAEP"] };

test("a round without a selection opens every product", () => {
  assert.equal(roundProductIdSet(wholeShop), null);
  assert.equal(roundProductIdSet(undefined), null);
  assert.equal(roundIncludesProduct(wholeShop, "ANYTHING"), true);
  // Rows written before per-round products existed have no scope at all.
  assert.equal(normalizeRoundProductScope(undefined), "all");
  assert.equal(normalizeRoundProductScope(""), "all");
  assert.equal(normalizeRoundProductScope("selected"), "selected");
});

test("a selected round only accepts the products it lists", () => {
  assert.deepEqual(roundProductIdSet(naemOnly), new Set(["NAEM", "NAEM-XL"]));
  assert.equal(roundIncludesProduct(naemOnly, "NAEM"), true);
  assert.equal(roundIncludesProduct(naemOnly, "KAEP"), false);
});

test("open rounds combine into the union of what any of them carries", () => {
  assert.deepEqual(openRoundProductIdSet([naemOnly, kaepOnly]), new Set(["NAEM", "NAEM-XL", "KAEP"]));
  // One whole-shop round lifts the restriction for everything on offer.
  assert.equal(openRoundProductIdSet([naemOnly, wholeShop]), null);
  // No open round means the storefront's existing "closed" state applies
  // instead of flagging every product as out-of-round.
  assert.equal(openRoundProductIdSet([]), null);
});

test("round input validation keeps a selected round from opening with nothing in it", () => {
  const base = { deliveryDate: "2026-08-20", opensAt: "2026-08-10T08:00", closesAt: "2026-08-19T20:00", status: "เตรียมเปิด", note: "" };

  const openShop = validateRoundInput({ ...base, productScope: "all", productIds: ["NAEM"] });
  assert.equal(openShop.productScope, "all");
  assert.deepEqual(openShop.productIds, [], "an all-shop round should not keep a stale selection");

  const selected = validateRoundInput({ ...base, productScope: "selected", productIds: ["naem", "NAEM", " kaep "] });
  assert.deepEqual(selected.productIds, ["NAEM", "KAEP"], "ids are normalised and de-duplicated");

  assert.throws(
    () => validateRoundInput({ ...base, productScope: "selected", productIds: [] }),
    AdminCmsValidationError,
  );
  assert.throws(
    () => validateRoundInput({ ...base, productScope: "everything", productIds: [] }),
    /รูปแบบการเปิดสินค้าของรอบไม่ถูกต้อง/,
  );
});
