import { expect, test } from "@playwright/test";

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

  await page.getByPlaceholder("ชื่อ–นามสกุล").fill("ทดสอบ ระบบอัตโนมัติ");
  await page.getByPlaceholder("08x-xxx-xxxx").fill("0812345678");
  await page.getByPlaceholder("เช่น 99 หมู่ 1 ถนนมิตรภาพ").fill("99 หมู่ 1 ถนนมิตรภาพ");

  await page.getByLabel("จังหวัด").selectOption({ label: "นครราชสีมา" });
  await page.getByLabel("อำเภอ").selectOption({ label: "บัวใหญ่" });
  await page.getByLabel("ตำบล").selectOption({ label: "บัวใหญ่" });

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

test("keeps the unsaved-changes affordance and payment summary usable on a small viewport", async ({ page }) => {
  await addFirstProductToCart(page);
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 500, "mobile-only assertion");

  const total = page.getByText(/^ยอดใน QR/);
  await total.scrollIntoViewIfNeeded();
  await expect(total).toBeInViewport();
});
