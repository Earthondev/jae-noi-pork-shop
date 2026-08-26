import { expect, test } from "@playwright/test";

type StorefrontPayload = Record<string, unknown> & {
  products?: unknown[];
  rounds?: unknown[];
  nextRound?: unknown;
  secureWriteReady?: boolean;
};

function withTestCategories(payload: StorefrontPayload): StorefrontPayload {
  const products = Array.isArray(payload.products)
    ? payload.products.map((product, index) => (
        product && typeof product === "object" && !Array.isArray(product)
          ? { ...product, category: index % 2 === 0 ? "แหนมหมู" : "แคปหมู" }
          : product
      ))
    : payload.products;
  return { ...payload, products };
}

async function readStorefrontSnapshot(page: import("@playwright/test").Page): Promise<StorefrontPayload> {
  const response = await page.context().request.get("/api/storefront");
  return withTestCategories(await response.json() as StorefrontPayload);
}

const OPEN_ROUND = {
  id: "RD-20991231",
  deliveryDate: "2099-12-31",
  opensAt: "2099-01-01T00:00",
  closesAt: "2099-12-30T23:59",
  label: "รอบจัดส่ง 31 ธ.ค. 2642",
  note: "",
};

/**
 * Covers the checkout + payment-QR flow end to end in a real browser, since
 * this money-touching path has already broken twice in ways unit tests
 * couldn't catch: a fixed-position bar losing its containing block, and a
 * canvas-drawn payment amount silently rendering white-on-white. These
 * tests don't submit a real order (no slip upload) — they guard the UI
 * behavior around it: validation, address cascading, and the on-screen
 * payment summary.
 */

test.beforeEach(async ({ page }) => {
  const payload = await readStorefrontSnapshot(page);
  await page.route("**/api/storefront", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...payload, rounds: [OPEN_ROUND], nextRound: null, secureWriteReady: true }),
  }));
  await page.goto("/");
  const dismiss = page.getByRole("button", { name: "ปิดข้อความแจ้งเตือน" });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
});

async function addFirstProductToCart(page: import("@playwright/test").Page) {
  const addButton = page.getByRole("button", { name: /^เพิ่ม .* ลงตะกร้า$/ }).first();
  await addButton.waitFor({ state: "visible" });
  await addButton.click();
  // Multiple cart-open buttons render at once on mobile (header, floating
  // pill, bottom nav) — the header one is the only stable cross-viewport
  // target.
  await page.locator(".cart-button").click();
}

async function mockStorefront(
  page: import("@playwright/test").Page,
  transform: (payload: StorefrontPayload) => StorefrontPayload,
) {
  await page.unroute("**/api/storefront");
  const payload = await readStorefrontSnapshot(page);
  await page.route("**/api/storefront", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(transform(payload)),
  }));
  await page.reload();
  const dismiss = page.getByRole("button", { name: "ปิดข้อความแจ้งเตือน" });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function fillPostalCheckout(page: import("@playwright/test").Page) {
  await page.getByPlaceholder("ชื่อ–นามสกุล").fill("ทดสอบ ระบบอัตโนมัติ");
  await page.getByPlaceholder("08x-xxx-xxxx").fill("0812345678");
  await page.getByPlaceholder("เช่น 99 หมู่ 1 ถนนมิตรภาพ").fill("99 หมู่ 1 ถนนมิตรภาพ");
  await page.getByLabel("จังหวัด").selectOption({ label: "นครราชสีมา" });
  await page.getByLabel("อำเภอ").selectOption({ label: "บัวใหญ่" });
  await page.getByLabel("ตำบล").selectOption({ label: "บัวใหญ่" });
}

test("blocks checkout submission until required fields are filled", async ({ page }) => {
  await addFirstProductToCart(page);

  const submit = page.getByRole("button", { name: "ยืนยันคำสั่งซื้อ" });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  // Native required-field validation should keep the form from submitting —
  // the name field (first required input) should report a validation error.
  const nameField = page.getByPlaceholder("ชื่อ–นามสกุล");
  const validationMessage = await nameField.evaluate((el: HTMLInputElement) => el.validationMessage);
  expect(validationMessage.length).toBeGreaterThan(0);
});

test("fills the postal address, auto-fills the postal code, and shows the payment total", async ({ page }) => {
  await addFirstProductToCart(page);

  await fillPostalCheckout(page);

  await expect(page.getByPlaceholder("รหัส 5 หลัก")).toHaveValue(/^\d{5}$/);

  // The PromptPay block renders the same total customers pay against — this
  // is the plain-DOM total, independent of the separately-tested canvas QR
  // image save/share feature.
  await expect(page.getByText(/^ยอดใน QR/)).toBeVisible();

  const submit = page.getByRole("button", { name: "ยืนยันคำสั่งซื้อ" });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  await expect(page.getByText("กรุณาแนบรูปสลิปโอนเงินก่อนยืนยันคำสั่งซื้อ")).toBeVisible();
});

test("uses one round state for the hero CTA and product purchase controls", async ({ page }) => {
  await mockStorefront(page, (payload) => ({ ...payload, rounds: [], nextRound: null }));

  await expect(page.getByRole("button", { name: "กดสนใจรอบหน้า" })).toBeEnabled();
  await expect(page.getByText("ยังไม่มีรอบที่เปิดรับ", { exact: true })).toBeVisible();
  await expect(page.getByText("รอเปิดรอบ").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^เพิ่ม .* ลงตะกร้า$/ })).toHaveCount(0);

  await mockStorefront(page, (payload) => ({ ...payload, rounds: [OPEN_ROUND], nextRound: null, secureWriteReady: true }));

  await expect(page.getByRole("link", { name: "เลือกสินค้า" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^เพิ่ม .* ลงตะกร้า$/ }).first()).toBeEnabled();
});

test("catches a round that closes in the final pre-submit refresh", async ({ page }) => {
  let roundOpen = true;
  await mockStorefront(page, (payload) => ({
    ...payload,
    rounds: roundOpen ? [OPEN_ROUND] : [],
    nextRound: null,
    secureWriteReady: true,
  }));
  await addFirstProductToCart(page);
  await fillPostalCheckout(page);
  await page.locator('input[name="slip"]').setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });

  roundOpen = false;
  await page.getByRole("button", { name: "ยืนยันคำสั่งซื้อ" }).click();

  await expect(page.getByRole("alert")).toContainText("รอบปิดพอดีระหว่างที่คุณกำลังสั่งซื้อ");
  await expect(page.getByRole("heading", { name: "ตะกร้ารอบนี้ยังปิดอยู่" })).toBeVisible();
  await expect(page.locator(".cart-line .increase-button")).toBeDisabled();
});

test("keeps the order id and attached slip in the downloadable success confirmation", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width !== 390, "single mobile confirmation coverage");
  const orderId = "JN-20260726-7G4K2P9ABC";
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => localStorage.setItem("e2e_clipboard", value),
        readText: async () => localStorage.getItem("e2e_clipboard") ?? "",
      },
    });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => { throw new Error("native share sheet is unavailable in headless mode"); },
    });
  });
  await page.route("**/api/orders", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ orderId, paymentStatus: "review" }),
  }));
  await addFirstProductToCart(page);
  await fillPostalCheckout(page);
  await page.locator('input[name="slip"]').setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "ยืนยันคำสั่งซื้อ" }).click();

  await expect(page.getByRole("heading", { name: "รับคำสั่งซื้อแล้ว" })).toBeVisible();
  await expect(page.locator(".success-order-id")).toContainText(orderId);
  await expect(page.getByAltText("สลิปที่แนบกับออเดอร์นี้")).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกใบยืนยันพร้อมสลิป" })).toBeVisible();

  await page.getByRole("button", { name: "คัดลอกรหัส" }).click();
  await expect(page.getByRole("button", { name: "คัดลอกแล้ว" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("e2e_clipboard"))).toBe(orderId);

  const stored = await page.evaluate(() => localStorage.getItem("jae_noi_recent_order_v1"));
  expect(stored).toContain(orderId);
  expect(stored).not.toMatch(/name|phone|address|slip|items|payment/i);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "บันทึกใบยืนยันพร้อมสลิป" }).click();
  expect((await download).suggestedFilename()).toBe(`jae-noi-order-${orderId}.png`);
});

test("prefills the latest locally remembered phone on the tracking page", async ({ page }) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width !== 390, "single mobile recent-phone coverage");
  const phone = "0931687892";
  await page.evaluate((value) => {
    localStorage.setItem("jae_noi_remembered_customers_v1", JSON.stringify({
      version: 1,
      customers: [{
        customerName: "ทดสอบ",
        phone: value,
        address: "",
        addressLine: "",
        subdistrict: "",
        district: "",
        province: "",
        postalCode: "",
        updatedAt: Date.now(),
        expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      }],
    }));
  }, phone);
  await page.goto("/track");

  await expect(page.getByLabel("เบอร์โทรที่ใช้ตอนสั่งซื้อ")).toHaveValue(phone);
  await expect(page.getByText("เติมเบอร์ที่เคยสั่งไว้ให้แล้ว")).toBeVisible();
});

test("shows a calm not-found state for a phone with no orders", async ({ page }) => {
  await page.route("**/api/orders/track", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders: [] }) });
  });
  await page.goto("/track");
  // React hasn't necessarily hydrated the form the instant goto() resolves —
  // the button is already in the SSR markup, so a plain visibility wait
  // doesn't prove its onClick/onSubmit handlers are attached yet. Clicking
  // too early lets the native submit fire instead (a full navigation to
  // "/track?", since the inputs have no name attribute). Networkidle is a
  // reliable enough proxy for "the client bundle has loaded and hydrated".
  await page.waitForLoadState("networkidle");

  await page.getByLabel("เบอร์โทรที่ใช้ตอนสั่งซื้อ").fill("0812345678");
  await page.getByRole("button", { name: "ค้นหาออเดอร์" }).click();

  await expect(page.getByRole("heading", { name: "ไม่พบออเดอร์ของเบอร์นี้" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ลองกรอกเบอร์อีกครั้ง" })).toBeVisible();
});

test("shows a tappable chooser when a phone has multiple orders", async ({ page }) => {
  const orders = [
    {
      orderId: "JN-20260726-7G4K2P9ABC", maskedPhone: "•••-•••-5678",
      createdAt: "2026-07-26T03:00:00.000Z", updatedAt: "2026-07-26T03:00:00.000Z",
      deliveryDate: "26 กรกฎาคม 2569", fulfilment: "pickup", fulfilmentLabel: "รับเองหน้าร้าน",
      subtotal: 200, shippingFee: 0, total: 200,
      paymentStatus: "paid", orderStatus: "completed",
      canReuploadSlip: false, mustContactShop: false,
      trackingNumber: null, carrierCode: null, carrierLabel: null, trackingUrl: null,
      items: [{ name: "แหนมหมู", quantity: 2, unitPrice: 100, lineTotal: 200 }],
    },
    {
      orderId: "JN-20260801-9K2M4P7XYZ", maskedPhone: "•••-•••-5678",
      createdAt: "2026-08-01T03:00:00.000Z", updatedAt: "2026-08-01T03:00:00.000Z",
      deliveryDate: "1 สิงหาคม 2569", fulfilment: "pickup", fulfilmentLabel: "รับเองหน้าร้าน",
      subtotal: 150, shippingFee: 0, total: 150,
      paymentStatus: "waiting_for_payment", orderStatus: "received",
      canReuploadSlip: false, mustContactShop: false,
      trackingNumber: null, carrierCode: null, carrierLabel: null, trackingUrl: null,
      items: [{ name: "ไส้กรอกอีสาน", quantity: 1, unitPrice: 150, lineTotal: 150 }],
    },
  ];
  await page.route("**/api/orders/track", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ orders }) });
  });
  await page.goto("/track");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("เบอร์โทรที่ใช้ตอนสั่งซื้อ").fill("0812345678");
  await page.getByRole("button", { name: "ค้นหาออเดอร์" }).click();

  await expect(page.getByRole("heading", { name: "พบ 2 ออเดอร์" })).toBeVisible();
  await expect(page.getByText("JN-20260726-7G4K2P9ABC")).toBeVisible();
  await expect(page.getByText("JN-20260801-9K2M4P7XYZ")).toBeVisible();
});

test("keeps hero and category navigation responsive at the configured breakpoint", async ({ page }) => {
  await mockStorefront(page, (payload) => ({ ...payload, rounds: [OPEN_ROUND], nextRound: null }));
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport is required");

  // Renamed in 7dd4dfa ("Replace hero photo card with a bleeding
  // product-spread image") — object-position: right top resolves to this.
  await expect(page.locator(".hero-photo-img")).toHaveCSS("object-position", "100% 0%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const categoryMenu = page.locator(".category-menu > summary");
  if (viewport.width >= 960) {
    await expect(categoryMenu).toBeVisible();
    await expect(categoryMenu).toHaveAttribute("aria-label", "เปิดเมนูหมวดสินค้า");
    await expect(page.locator(".hero")).toHaveCSS("align-items", "start");
  } else {
    await expect(categoryMenu).toBeHidden();
    await expect(page.locator(".categories-container")).toBeVisible();
  }
});

test("keeps the unsaved-changes affordance and payment summary usable on a small viewport", async ({ page }) => {
  await addFirstProductToCart(page);
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 500, "mobile-only assertion");

  const total = page.getByText(/^ยอดใน QR/);
  await total.scrollIntoViewIfNeeded();
  await expect(total).toBeInViewport();
});
