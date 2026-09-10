import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  KEYWORDS,
  SHOP,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  SHOP_LINKS,
  fullAddress,
  shopJsonLd,
} from "../lib/seo.ts";

test("the title and description carry the products, the shop and the place", () => {
  for (const term of ["แหนมหมู", "ไส้กรอกอีสาน", "แคปหมู", "เจ๊น้อย"]) {
    assert.ok(SITE_TITLE.includes(term), `title ควรมี ${term}`);
  }
  assert.ok(SITE_DESCRIPTION.includes("บัวใหญ่") && SITE_DESCRIPTION.includes("นครราชสีมา"), "description ต้องบอกที่ตั้ง");
  // Google truncates around 160; a description longer than that loses its tail.
  assert.ok(SITE_DESCRIPTION.length <= 165, `description ยาว ${SITE_DESCRIPTION.length} เกินที่ Google แสดง`);
  assert.ok(SITE_TITLE.length <= 75, `title ยาว ${SITE_TITLE.length} เกินไป`);
});

test("store schema describes the business without a second product price source", () => {
  const data = JSON.parse(shopJsonLd());
  assert.equal(data["@type"], "Store");
  assert.equal(data.url, SITE_URL);
  assert.equal(data.telephone, SHOP.phonePrimary);
  assert.equal(data.address.postalCode, "30120");
  assert.equal(data.makesOffer, undefined);
});

test("the JSON-LD cannot break out of its script tag", () => {
  // dangerouslySetInnerHTML puts this straight into the document; a raw
  // "</script>" anywhere in the data would end the block early.
  assert.doesNotMatch(shopJsonLd(), /<\/script/i);
  assert.ok(fullAddress().includes("นครราชสีมา"));
});

test("robots.txt opens the shop and closes the pages holding customer data", async () => {
  const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  for (const path of ["/admin", "/api/", "/track"]) {
    assert.ok(robots.includes(`Disallow: ${path}`), `ต้องปิด ${path}`);
  }
  assert.match(robots, /^Sitemap: https:\/\/jaenoishop\.com\/sitemap\.xml$/m);
  // Blocking crawlers is the opposite of the goal here.
  assert.doesNotMatch(robots, /^Disallow: \/$/m);
});

test("keywords stay unique and cover the shop's own products", () => {
  assert.equal(new Set(KEYWORDS).size, KEYWORDS.length, "คีย์เวิร์ดซ้ำ");
  for (const term of ["แหนมหมู", "ไส้กรอกอีสาน", "แคปหมู", "กากหมูโบราณ"]) {
    assert.ok(KEYWORDS.some((keyword) => keyword.includes(term)), `ขาดคีย์เวิร์ด ${term}`);
  }
});

test("the shop uses the verified production map and owner-provided business profile", () => {
  // Verified against production on 2026-09-10, not the local seed data.
  assert.equal(SHOP_LINKS.googleMaps, "https://maps.app.goo.gl/C7sFuXvWZZeHuL1u8?g_st=ic");
  assert.equal(SHOP_LINKS.googleBusinessProfile, "https://share.google/xImLwlrVykUpT5klZ");

  const data = JSON.parse(shopJsonLd());
  assert.equal(data.hasMap, SHOP_LINKS.googleMaps);
  assert.ok(data.sameAs.includes(SHOP_LINKS.googleMaps));
  assert.ok(data.sameAs.includes(SHOP_LINKS.googleBusinessProfile));
  // An empty link must be dropped, never emitted as a dead sameAs entry.
  assert.ok(data.sameAs.every((link) => link.startsWith("https://")));
});
