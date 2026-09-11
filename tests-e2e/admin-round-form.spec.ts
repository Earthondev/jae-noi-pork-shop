import { expect, test } from "@playwright/test";

test("mobile round form keeps save visible and explains a duplicate delivery date", async ({ page }) => {
  await page.goto("/admin?tab=rounds");
  await page.getByRole("button", { name: "เพิ่มรอบ", exact: true }).click();

  const quickSave = page.locator(".admin-round-quick-save");
  await expect(quickSave).toBeVisible();
  await expect(page.locator(".admin-round-product-grid")).toHaveCount(0);
  await expect(page.locator(".admin-round-all-summary")).toContainText("เปิดขายสินค้าที่พร้อมขายครบทั้ง");

  const deliveryDate = page.getByLabel("วันจัดส่ง", { exact: true });
  const opensAt = page.locator(".admin-datetime-field").filter({ hasText: "เปิดรับตั้งแต่" });
  const closesAt = page.locator(".admin-datetime-field").filter({ hasText: "ปิดรับวันที่" });
  const opensTime = opensAt.getByLabel("เวลา 24 ชม.");
  const closesTime = closesAt.getByLabel("เวลา 24 ชม.");
  await expect(deliveryDate).toHaveAttribute("lang", "th-TH");
  await expect(opensTime).toHaveAttribute("inputmode", "numeric");
  await expect(closesTime).toHaveAttribute("inputmode", "numeric");
  await deliveryDate.fill("2026-09-30");
  await opensAt.getByLabel("วันที่").fill("2026-09-11");
  await opensTime.fill("1313");
  await closesAt.getByLabel("วันที่").fill("2026-09-29");
  await closesTime.fill("1313");
  await expect(opensTime).toHaveValue("13:13");
  await expect(closesTime).toHaveValue("13:13");

  await page.route("**/api/admin/cms", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "DUPLICATE",
        error: "มีรอบของวันจัดส่งนี้อยู่แล้ว กรุณาเลือกวันอื่น หรือยกเลิกเพื่อกลับไปแก้รอบเดิม",
      }),
    });
  });

  await quickSave.click();
  const notice = page.locator(".admin-save-notice");
  await expect(notice).toContainText("มีรอบของวันจัดส่งนี้อยู่แล้ว");
  await expect(notice).not.toContainText("กดบันทึกอีกครั้ง");

  await page.screenshot({ path: "output/playwright/admin-round-form-mobile.png", fullPage: false });
});
