import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatThaiAddress } from "../lib/thai-address.ts";
import { isValidStructuredThaiAddress } from "../lib/thai-address-validation.ts";

test("validates a complete Thai address hierarchy and its postal code", () => {
  const address = { addressLine: "99 หมู่ 1", subdistrict: "บัวใหญ่", district: "บัวใหญ่", province: "นครราชสีมา", postalCode: "30120" };
  assert.equal(isValidStructuredThaiAddress(address), true);
  assert.equal(formatThaiAddress(address), "99 หมู่ 1 ต.บัวใหญ่ อ.บัวใหญ่ จ.นครราชสีมา 30120");
  assert.equal(isValidStructuredThaiAddress({ ...address, postalCode: "10200" }), false);
  assert.equal(isValidStructuredThaiAddress({ ...address, district: "พระนคร" }), false);
});

test("formats Bangkok with khwaeng and khet labels", () => {
  const address = { addressLine: "1 ถนนสนามไชย", subdistrict: "พระบรมมหาราชวัง", district: "พระนคร", province: "กรุงเทพมหานคร", postalCode: "10200" };
  assert.equal(isValidStructuredThaiAddress(address), true);
  assert.equal(formatThaiAddress(address), "1 ถนนสนามไชย แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200");
});

test("checkout loads local address data and stores structured fields", async () => {
  const [fields, route, repository] = await Promise.all([
    readFile(new URL("../app/_components/shop/address-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/order-repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(fields, /\/data\/thai-addresses\.json/);
  assert.match(fields, /cache: "force-cache"/);
  assert.match(fields, /name="province"/);
  assert.match(fields, /name="district"/);
  assert.match(fields, /name="subdistrict"/);
  assert.match(fields, /name="postalCode"/);
  assert.match(route, /isValidStructuredThaiAddress/);
  assert.match(repository, /addressLine/);
  assert.match(repository, /postalCode/);
});
