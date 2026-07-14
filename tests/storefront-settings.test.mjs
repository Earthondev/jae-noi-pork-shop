import assert from "node:assert/strict";
import test from "node:test";
import { safePickupMapUrl } from "../lib/storefront-settings.ts";

test("allows only HTTPS Google Maps pickup links", () => {
  const shortLink = "https://maps.app.goo.gl/uVChd79bzjbXYwtXA?g_st=il";
  assert.equal(safePickupMapUrl(shortLink), shortLink);
  assert.equal(safePickupMapUrl("https://www.google.com/maps?q=15.6340758,102.3833433"), "https://www.google.com/maps?q=15.6340758,102.3833433");
  assert.equal(safePickupMapUrl("http://maps.app.goo.gl/example"), null);
  assert.equal(safePickupMapUrl("https://example.com/maps/store"), null);
  assert.equal(safePickupMapUrl("javascript:alert(1)"), null);
  assert.equal(safePickupMapUrl("https://www.google.com/search?q=store"), null);
});
