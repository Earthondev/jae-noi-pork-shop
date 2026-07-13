import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the Thai mobile shop content and accessibility contract", async () => {
  const [shop, layout, css] = await Promise.all([
    readFile(new URL("../app/shop.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /<html lang="th">/);
  assert.match(shop, /เจ้น้อย เขียงหมูตะคร้อ/);
  assert.match(shop, /แหนมหมู/);
  assert.match(shop, /รอข้อมูลราคา/);
  assert.match(shop, /role="dialog"/);
  assert.match(shop, /aria-modal="true"/);
  assert.match(shop, /event\.key === "Escape"/);
  assert.match(css, /--red-700:/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.floating-cart/);
});
