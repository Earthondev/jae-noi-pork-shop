import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The storefront was split into `app/shop.tsx` (container) plus modular
// presentational components (`app/_components/shop/*`) and data hooks
// (`app/_hooks/*`). The content/accessibility contract below is about the
// rendered shop experience as a whole, so it is checked against the
// concatenation of every file that makes up that experience, regardless of
// which specific file now owns a given piece of markup or logic.
const SHOP_SOURCE_FILES = [
  "../app/shop.tsx",
  "../app/_hooks/use-storefront.ts",
  "../app/_hooks/use-checkout-draft.ts",
  "../app/_components/shop/site-header.tsx",
  "../app/_components/shop/hero.tsx",
  "../app/_components/shop/product-card.tsx",
  "../app/_components/shop/product-grid.tsx",
  "../app/_components/shop/bottom-nav.tsx",
  "../app/_components/shop/cart-drawer.tsx",
];

test("keeps the Thai mobile shop content and accessibility contract", async () => {
  const [shopParts, tracker, layout, css] = await Promise.all([
    Promise.all(SHOP_SOURCE_FILES.map((path) => readFile(new URL(path, import.meta.url), "utf8"))),
    readFile(new URL("../app/track/order-tracker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const shop = shopParts.join("\n");
  assert.match(layout, /<html lang="th">/);
  assert.match(shop, /เจ๊น้อย เขียงหมูตะคร้อ/);
  assert.match(shop, /แหนมหมู/);
  assert.match(shop, /รอข้อมูลราคา/);
  assert.match(shop, /role="dialog"/);
  assert.match(shop, /aria-modal="true"/);
  assert.match(shop, /event\.key === "Escape"/);
  assert.match(shop, /phonePrimary\.replace/);
  assert.match(shop, /phoneSecondary\.replace/);
  assert.doesNotMatch(shop, /href="\/admin"/);
  assert.doesNotMatch(shop, /หลังบ้านร้านค้า/);
  assert.match(shop, /0 บาท \(ฟรี\)/);
  assert.match(shop, /เปิดแผนที่ \/ นำทาง/);
  assert.match(shop, /rel="noopener noreferrer"/);
  assert.match(shop, /!storefront\.orderingOpen/);
  assert.match(shop, /const orderingOpen = !storeLoading && rounds\.length > 0/);
  assert.match(shop, /aria-live="polite"/);
  assert.match(shop, /รอเปิดรอบ/);
  assert.match(shop, /disabled={!orderingOpen \|\| outOfRound}/);
  // Products a round does not carry stay visible but unaddable, in the
  // storefront and in the cart alike.
  assert.match(shop, /ไม่มีในรอบนี้/);
  assert.match(shop, /disabled={!storefront\.orderingOpen \|\| !inRound}/);
  assert.match(shop, /className="closed-round-cart"/);
  assert.match(shop, /สินค้าในตะกร้ายังไม่ถูกจองและยังไม่ต้องชำระเงิน/);
  assert.match(shop, /กลับไปเลือกสินค้า/);
  assert.match(shop, /setInterval\(\(\) => void refreshStorefront\(\), 30_000\)/);
  assert.match(shop, /const latestStorefront = await storefront\.refreshStorefront\(\)/);
  assert.match(shop, /รอบปิดพอดีระหว่างที่คุณกำลังสั่งซื้อ/);
  assert.match(shop, /ปิดรับชั่วคราว/);
  assert.match(shop, /product-card-skeleton/);
  assert.doesNotMatch(shop, /fallbackProducts/);
  assert.match(tracker, /phonePrimary\.replace/);
  assert.match(tracker, /phoneSecondary\.replace/);
  assert.match(css, /--red-700:/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.floating-cart/);
  assert.match(css, /\.closed-round-cart/);
  assert.match(css, /\.pickup-map-link/);
  assert.match(css, /object-position: right top/);
  assert.match(css, /align-items: start/);
  assert.match(css, /@media \(min-width: 960px\)/);
});

test("uses the shop logo for browser and Apple icons", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /\/favicon-shop-v2\.ico/);
  assert.match(layout, /\/favicon-shop-v2-32\.png/);
  assert.match(layout, /\/apple-touch-icon-v2\.png/);
  assert.doesNotMatch(layout, /favicon\.svg/);
});
