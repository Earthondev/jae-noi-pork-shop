import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MAX_SLIP_RETRIES, canReuploadSlip, mustContactShop, slipRetriesLeft } from "../lib/slip-retry.ts";

test("only a rejected slip can be replaced, and only once", () => {
  assert.equal(canReuploadSlip({ paymentStatus: "invalid_slip", slipRetriesUsed: 0 }), true);
  assert.equal(canReuploadSlip({ paymentStatus: "invalid_slip", slipRetriesUsed: MAX_SLIP_RETRIES }), false);

  // Nothing to fix on an order that is paid or already queued for a human.
  for (const paymentStatus of ["paid", "waiting_for_slip_review", "waiting_for_payment", "refunded"]) {
    assert.equal(canReuploadSlip({ paymentStatus, slipRetriesUsed: 0 }), false, paymentStatus);
    assert.equal(mustContactShop({ paymentStatus, slipRetriesUsed: MAX_SLIP_RETRIES }), false, paymentStatus);
  }
});

test("a spent retry hands the customer over to the shop", () => {
  const spent = { paymentStatus: "invalid_slip", slipRetriesUsed: MAX_SLIP_RETRIES };
  assert.equal(canReuploadSlip(spent), false);
  assert.equal(mustContactShop(spent), true);
  // The two states are mutually exclusive — the page must never offer both.
  const fresh = { paymentStatus: "invalid_slip", slipRetriesUsed: 0 };
  assert.equal(canReuploadSlip(fresh) && mustContactShop(fresh), false);
});

test("a corrupt retry counter fails closed rather than granting extra tries", () => {
  assert.equal(slipRetriesLeft({ paymentStatus: "invalid_slip", slipRetriesUsed: 99 }), 0);
  assert.equal(slipRetriesLeft({ paymentStatus: "invalid_slip", slipRetriesUsed: Number.NaN }), 0);
  // A negative count is treated as "none used" rather than as extra budget.
  assert.equal(slipRetriesLeft({ paymentStatus: "invalid_slip", slipRetriesUsed: -5 }), MAX_SLIP_RETRIES);
});

test("the re-upload endpoint re-checks the budget in the write itself", async () => {
  const repository = await readFile(new URL("../db/order-repository.ts", import.meta.url), "utf8");
  // A lookup-then-write pair with no guard would let two uploads racing each
  // other both spend the single retry.
  assert.match(repository, /payment_status = 'invalid_slip' AND slip_retries_used < \?/);

  const route = await readFile(new URL("../app/api/orders/track/slip/route.ts", import.meta.url), "utf8");
  assert.match(route, /isTrackingLookupInput/, "must authenticate by order id + phone last 4");
  assert.match(route, /checkRateLimit/);
  assert.match(route, /detectSupportedImageType/);
  assert.match(route, /verifySlipWithSlipOk/);
  assert.match(route, /applySlipReupload/);
});
