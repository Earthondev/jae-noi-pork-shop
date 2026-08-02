import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const pickupList = process.env.TRACKING_IMPORT_FIXTURE || "/Users/earthondev/Downloads/Pickuplist-2026-07-25.xls";
const outputDir = join(process.cwd(), "output/playwright/tracking-import");

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});

try {
  // There is no sign-in step any more. Production is behind Cloudflare Access,
  // and a local dev server admits the APP_ENV === "development" user straight
  // away. Point BASE_URL somewhere else and this lands on the Access login,
  // which is the correct failure rather than a bug in this script.
  await page.goto(`${baseUrl}/admin`);
  try {
    await page.getByRole("heading", { name: "นำเข้าเลขพัสดุ" }).waitFor();
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    throw new Error(`tracking import panel did not render: ${body.slice(0, 500)} | ${browserErrors.join(" | ")}`, { cause: error });
  }

  await page.locator('.tracking-file-drop input[type="file"]').setInputFiles(pickupList);
  await page.getByRole("button", { name: "ตรวจไฟล์และพรีวิว" }).click();
  await page.getByRole("heading", { name: /ผลตรวจ 5 พัสดุ/ }).waitFor();
  await page.screenshot({ path: join(outputDir, "desktop-preview.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "นำเข้าเลขพัสดุ" }).scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("tracking import panel overflows the mobile viewport");
  await page.screenshot({ path: join(outputDir, "mobile-preview.png"), fullPage: true });

  if (browserErrors.length > 0) throw new Error(`browser errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({ previewRows: 5, mobileOverflow: false, browserErrors: 0, outputDir }));
} finally {
  await context.close();
  await browser.close();
}
