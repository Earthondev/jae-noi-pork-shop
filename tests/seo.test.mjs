import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { KEYWORDS, SHOP, SITE_DESCRIPTION, SITE_TITLE, SITE_URL, fullAddress, shopJsonLd } from "../lib/seo.ts";

test("the title and description carry the products, the shop and the place", () => {
  for (const term of ["แหนมหมู", "ไส้กรอกอีสาน", "แคปหมู", "เจ๊น้อย"]) {
    assert.ok(SITE_TITLE.includes(term), `title ควรมี ${term}`);
  }
  assert.ok(SITE_DESCRIPTION.includes("บัวใหญ่") && SITE_DESCRIPTION.includes("นครราชสีมา"), "description ต้องบอกที่ตั้ง");
  // Google truncates around 160; a description longer than that loses its tail.
  assert.ok(SITE_DESCRIPTION.length <= 165, `description ยาว ${SITE_DESCRIPTION.length} เกินที่ Google แสดง`);
  assert.ok(SITE_TITLE.length <= 75, `title ยาว ${SITE_TITLE.length} เกินไป`);
});

test("structured data is valid JSON and states the shop's real contact details", () => {
  const data = JSON.parse(shopJsonLd());
  assert.equal(data["@context"], "https://schema.org");
  assert.equal(data["@type"], "Store");
  assert.equal(data.url, SITE_URL);
  assert.equal(data.telephone, SHOP.phonePrimary);
  assert.equal(data.address.postalCode, "30120");
  assert.equal(data.address.addressCountry, "TH");
  assert.equal(data.address.addressRegion, SHOP.province);
  // Assistants read makesOffer to answer "ร้านนี้ขายอะไร".
  const offered = data.makesOffer.map((entry) => entry.itemOffered.name);
  assert.deepEqual(offered, ["แหนมหมู", "ไส้กรอกอีสาน", "กากหมูโบราณ"]);
  assert.ok(data.makesOffer.every((entry) => entry.priceCurrency === "THB"));
  // Google's Product rich result requires offers/review/aggregateRating on the
  // Product node itself — regression test for the "8 invalid" Search Console error.
  for (const entry of data.makesOffer) {
    assert.ok(entry.itemOffered.offers, `${entry.itemOffered.name} ต้องมี offers`);
    assert.equal(typeof entry.itemOffered.offers.price, "number");
    assert.equal(entry.itemOffered.offers.priceCurrency, "THB");
    // `image` is required (not just recommended) for Product rich results.
    assert.ok(entry.itemOffered.image?.startsWith(SITE_URL), `${entry.itemOffered.name} ต้องมี image แบบ absolute URL`);
  }
  // The Organization/LocalBusiness logo Google's Merchant and Knowledge Panel
  // surfaces read, distinct from the generic `image` field above.
  assert.ok(data.logo?.startsWith(SITE_URL), "ต้องมี logo แบบ absolute URL");
  const porkRind = data.makesOffer.find((entry) => entry.itemOffered.name === "กากหมูโบราณ");
  assert.equal(porkRind.itemOffered.alternateName, "แคปหมู", "แคปหมู ต้องผูกกับสินค้าเดียวกัน ไม่ใช่รายการแยก");
  // Each Product should point at a real, crawlable page about itself, not
  // just live nested inside the Store's makesOffer — regression test for
  // slug drift between here and the app/products/<slug> route folders.
  assert.deepEqual(
    data.makesOffer.map((entry) => entry.itemOffered.url),
    [`${SITE_URL}/products/naem-moo`, `${SITE_URL}/products/sai-krok-isan`, `${SITE_URL}/products/kaep-moo`],
  );
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

test("sitemap.xml uses the real sitemaps.org namespace", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  // A one-letter slip here ("sitemap.org") silently invalidates the whole file.
  assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(listed, [
    "https://jaenoishop.com/",
    "https://jaenoishop.com/products",
    "https://jaenoishop.com/products/naem-moo",
    "https://jaenoishop.com/products/sai-krok-isan",
    "https://jaenoishop.com/products/kaep-moo",
    "https://jaenoishop.com/how-to-order",
  ]);
  // Checked against the listed URLs rather than the file text, so a comment
  // explaining why customer-data pages are excluded does not trip the assertion.
  assert.ok(listed.every((url) => !url.includes("/admin") && !url.includes("/track")));
});

test("keywords stay unique and cover the shop's own products", () => {
  assert.equal(new Set(KEYWORDS).size, KEYWORDS.length, "คีย์เวิร์ดซ้ำ");
  for (const term of ["แหนมหมู", "ไส้กรอกอีสาน", "แคปหมู", "กากหมูโบราณ"]) {
    assert.ok(KEYWORDS.some((keyword) => keyword.includes(term)), `ขาดคีย์เวิร์ด ${term}`);
  }
});
