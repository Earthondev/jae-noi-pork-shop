import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const OUTPUT_DIR = "/Users/earthondev/Desktop/jae-noi-pork-shop/output/playwright/storefront-ux-flow";

async function main() {
  console.log("=== เริ่มต้นสคริปต์จับภาพหน้าจอ UX/UI (Playwright) ===");
  await mkdir(OUTPUT_DIR, { recursive: true });

  // 1. เริ่มรัน dev server ในเบื้องหลัง
  console.log("🚀 กำลังสตาร์ท Local Dev Server (npm run dev)...");
  const devServer = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev"],
    {
      cwd: "/Users/earthondev/Desktop/jae-noi-pork-shop",
      stdio: "inherit",
      env: { ...process.env, ALLOW_DEV_WRITES: "true" }
    }
  );

  // ฟังก์ชันรอพอร์ต 3000 เปิดใช้งาน
  const waitPort = async (port) => {
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/`);
        if (res.status === 200 || res.status === 302 || res.status === 404) {
          return;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ที่พอร์ต ${port} ได้ในเวลาที่กำหนด`);
  };

  try {
    await waitPort(PORT);
    console.log("✅ Local Dev Server พร้อมใช้งานแล้ว!");

    // 2. เริ่มต้นเบราว์เซอร์ Playwright
    console.log("🌐 กำลังเปิด Chromium...");
    const browser = await chromium.launch({ headless: true });
    
    // -- FLOW 1: หน้าแรกร้านค้าบน Desktop --
    console.log("📸 1. จับภาพหน้าแรกบน Desktop (1280x800)...");
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(BASE_URL);
    await desktopPage.waitForTimeout(2000); // รอรูปโหลด
    await desktopPage.screenshot({ path: join(OUTPUT_DIR, "01-storefront-desktop.png") });
    await desktopContext.close();

    // -- FLOW 2: หน้าแรกและเช็คเอาท์บน Mobile --
    console.log("📸 2. จับภาพหน้าแรกบน Mobile (390x844)...");
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobilePage = await mobileContext.newPage();
    
    mobilePage.on("console", (msg) => console.log(`[Browser Console] ${msg.text()}`));
    mobilePage.on("pageerror", (err) => console.error(`[Browser PageError] ${err.message}`));

    await mobilePage.goto(BASE_URL);
    await mobilePage.waitForTimeout(2000);
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "02-storefront-mobile.png") });

    // 3. เปิดตะกร้าเปล่า
    console.log("📸 3. เปิดตะกร้าเปล่าบน Mobile...");
    const cartBtn = mobilePage.locator(".cart-button, .bottom-nav-item:nth-child(4)");
    await cartBtn.first().click();
    await mobilePage.waitForTimeout(800); // รอแอนิเมชันสไลด์
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "03-cart-drawer-empty-mobile.png") });

    // ปิดตะกร้าก่อนเพื่อกดเพิ่มสินค้า
    console.log("เพิ่มสินค้าลงตะกร้า...");
    const closeBtn = mobilePage.locator(".drawer-heading button");
    await closeBtn.first().click();
    await mobilePage.waitForTimeout(500);

    // กดเพิ่มสินค้าตัวแรก
    const addBtns = mobilePage.locator(".product-add-button");
    if (await addBtns.count() > 0) {
      await addBtns.first().click();
      await mobilePage.waitForTimeout(300);
      await addBtns.first().click(); // เบิ้ลเป็น 2 ชิ้น
      await mobilePage.waitForTimeout(300);
      if (await addBtns.count() > 1) {
        await addBtns.nth(1).click(); // ชิ้นที่สอง 1 ชิ้น
        await mobilePage.waitForTimeout(300);
      }
    }

    // 4. เปิดตะกร้าที่มีสินค้า
    console.log("📸 4. เปิดตะกร้าที่มีสินค้า...");
    await cartBtn.first().click();
    await mobilePage.waitForTimeout(800);
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "04-cart-drawer-items-mobile.png") });

    // 5. กรอกฟอร์มเช็คเอาท์
    console.log("📸 5. กรอกฟอร์มเช็คเอาท์และแสดง QR พร้อมเพย์...");
    // กรอกฟอร์ม
    await mobilePage.fill('input[name="customerName"]', "คุณดวงใจ ปานดำ");
    await mobilePage.fill('input[name="phone"]', "0899999999");
    await mobilePage.fill('textarea[name="note"]', "ต้องการความกรอบพิเศษ ส่งช่วงบ่ายค่ะ");

    // เลือกจัดส่งพัสดุเพื่อโชว์ช่องที่อยู่
    const postalRadio = mobilePage.locator('input[value="postal"]');
    if (await postalRadio.count() > 0) {
      await postalRadio.click();
      await mobilePage.waitForTimeout(500);
      await mobilePage.fill('textarea[name="addressLine"]', "99/9 หมู่ 2 ซอยมิตรภาพ 4");
      
      // เลือกจังหวัด
      await mobilePage.selectOption('select[name="province"]', "นครราชสีมา");
      await mobilePage.waitForTimeout(500);
      // เลือกอำเภอ/เขต
      await mobilePage.selectOption('select[name="district"]', "เมืองนครราชสีมา");
      await mobilePage.waitForTimeout(500);
      // เลือกตำบล/แขวง
      await mobilePage.selectOption('select[name="subdistrict"]', "ในเมือง");
      await mobilePage.waitForTimeout(500);
    }

    // เลื่อนลงไปให้เห็น QR Code และปุ่มชำระเงินชัดเจน
    await mobilePage.evaluate(() => {
      const drawer = document.querySelector(".cart-drawer");
      if (drawer) drawer.scrollTop = drawer.scrollHeight;
    });
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "05-checkout-form-mobile.png") });

    // 6. กดสั่งซื้อเพื่อแสดง Order Success
    console.log("📸 6. ยืนยันสั่งซื้อเพื่อรับเลขออเดอร์ (Order Success)...");
    const submitBtn = mobilePage.locator(".submit-order");
    await submitBtn.click();
    
    // รอจนกว่าจะแสดงหน้าความสำเร็จ
    try {
      await mobilePage.waitForSelector(".success-card", { timeout: 15000 });
      await mobilePage.screenshot({ path: join(OUTPUT_DIR, "06-order-success-mobile.png") });
    } catch (e) {
      console.log("❌ ล้มเหลวในการรอ .success-card. ตรวจหาข้อความแจ้งเตือนหรือข้อผิดพลาดบนหน้าเว็บ...");
      // ลองหาป้ายเตือนต่างๆ
      const noticeText = await mobilePage.locator(".form-notice, .cart-notice, .storefront-notice").allInnerTexts().catch(() => []);
      console.log("ข้อความแจ้งเตือนที่พบในหน้าเว็บ:", noticeText);
      const bodyText = await mobilePage.locator("body").innerText().catch(() => "");
      console.log("ข้อความทั้งหมดในเพจ:", bodyText.slice(0, 1000));
      throw e;
    }

    // เก็บเลขออเดอร์
    const orderId = await mobilePage.locator(".success-card strong").first().innerText();
    console.log(`เลขออเดอร์ที่ถูกสร้าง: ${orderId}`);

    // -- FLOW 3: ติดตามออเดอร์ (Track) --
    console.log("📸 7. หน้าติดตามออเดอร์สถานะว่างเปล่า...");
    await mobilePage.goto(`${BASE_URL}/track`);
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "07-track-page-empty-mobile.png") });

    console.log("📸 8. แสดงประวัติการสั่งซื้อจากการค้นหาเบอร์โทร...");
    await mobilePage.fill('.track-form input[inputmode="tel"]', "0899999999");
    await mobilePage.locator('.track-form button[type="submit"]').click();
    
    // รอผลลัพธ์
    await mobilePage.waitForSelector(".track-history-card, .track-result", { timeout: 10000 });
    // กดขยายออเดอร์เพื่อดูรายละเอียด
    const orderHeader = mobilePage.locator(".track-order-summary").first();
    await orderHeader.click();
    await mobilePage.waitForTimeout(500);
    await mobilePage.screenshot({ path: join(OUTPUT_DIR, "08-track-page-results-mobile.png") });
    await mobileContext.close();

    // -- FLOW 4: หน้าจอแอดมินหลังบ้าน (Admin Dashboard) --
    console.log("📸 9. หน้าล็อกอินหลังบ้านบน Desktop...");
    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE_URL}/admin/login`);
    await adminPage.waitForTimeout(1000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "09-admin-login-desktop.png") });

    console.log("📸 10. แผงควบคุมแอดมิน - แท็บออเดอร์...");
    await adminPage.fill('input[name="username"]', "admin");
    await adminPage.fill('input[name="password"]', "admin123");
    await adminPage.locator('.admin-login-form button[type="submit"]').click();
    
    // รอเข้าหลังบ้าน
    await adminPage.waitForURL((url) => url.pathname === "/admin", { timeout: 10000 });
    await adminPage.waitForTimeout(2000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "10-admin-orders-desktop.png") });

    console.log("📸 11. แผงควบคุมแอดมิน - แท็บรอบขาย...");
    await adminPage.locator('button:has-text("รอบขาย")').click();
    await adminPage.waitForTimeout(1000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "11-admin-rounds-desktop.png") });

    console.log("📸 12. แผงควบคุมแอดมิน - แท็บสินค้า...");
    await adminPage.locator('button:has-text("สินค้า")').click();
    await adminPage.waitForTimeout(1000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "12-admin-products-desktop.png") });

    console.log("📸 13. แผงควบคุมแอดมิน - แท็บตั้งค่าหน้าร้าน...");
    await adminPage.locator('button:has-text("หน้าร้าน"), button:has-text("ตั้งค่าหน้าร้าน")').click();
    await adminPage.waitForTimeout(1000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "13-admin-storefront-desktop.png") });

    // 14. หน้าแอดมินบนมือถือ
    console.log("📸 14. แผงควบคุมแอดมินบนอุปกรณ์เคลื่อนที่...");
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.waitForTimeout(1000);
    await adminPage.screenshot({ path: join(OUTPUT_DIR, "14-admin-mobile-dashboard.png") });

    // ปิดเบราว์เซอร์
    await adminContext.close();
    await browser.close();
    console.log("🎉 การจับภาพหน้าจอ UX ทั้ง 14 สถานะสำเร็จสมบูรณ์!");
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดระหว่างสคริปต์:", error);
  } finally {
    console.log("🧹 กำลังปิด Local Dev Server...");
    devServer.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("=== สิ้นสุดสคริปต์ ===");
  }
}

main().catch(console.error);
