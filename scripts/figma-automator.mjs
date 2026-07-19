import { chromium } from "playwright";
import readline from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const IMAGES_DIR = join(PROJECT_ROOT, "output", "playwright", "storefront-ux-flow");

async function main() {
  console.log("\n==============================================");
  console.log("🚀 ยินดีต้อนรับสู่ระบบ Figma Flowchart Automator");
  console.log("==============================================\n");

  // 1. ตรวจสอบรูปภาพสกรีนช็อต 14 รูป
  const filesToUpload = [];
  for (let i = 1; i <= 14; i++) {
    const filename = `${String(i).padStart(2, "0")}-${getSuffix(i)}.png`;
    const filepath = join(IMAGES_DIR, filename);
    if (!existsSync(filepath)) {
      console.error(`❌ ไม่พบไฟล์ภาพที่จำเป็น: ${filename} ในโฟลเดอร์ ${IMAGES_DIR}`);
      console.log("กรุณารันสคริปต์จับภาพหน้าจอ UX/UI ก่อนโดยพิมพ์: node scripts/capture-all-ux-states.mjs");
      process.exit(1);
    }
    filesToUpload.push(filepath);
  }
  
  console.log(`✅ ตรวจพบภาพหน้าจอครบทั้ง 14 ไฟล์แล้ว!`);
  console.log("   กำลังเปิดหน้าต่าง Chromium เบราว์เซอร์เพื่อให้คุณเข้าสู่ระบบ...\n");

  // 2. สตาร์ทเบราว์เซอร์จริงแบบแสดงผล (headless: false)
  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"]
  });
  
  const context = await browser.newContext({
    viewport: null
  });
  
  const page = await context.newPage();
  
  // นำไปหน้าล็อกอิน Figma
  await page.goto("https://www.figma.com/login");

  console.log("👉 [ขั้นตอนที่ 1]: กรุณาเข้าสู่ระบบ Figma บนหน้าต่างเบราว์เซอร์ที่แสดงขึ้นมา");
  console.log("👉 [ขั้นตอนที่ 2]: เปิดไฟล์ออกแบบ Figma ที่คุณต้องการนำเข้า Flowchart (หรือกดสร้างไฟล์ดีไซน์ใหม่)");
  console.log("👉 [ขั้นตอนที่ 3]: หากยังไม่ได้ลงทะเบียนปลั๊กอิน ให้ทำตามนี้ในบอร์ด Figma:");
  console.log("   - กดปุ่มลัด Shift + I -> เลือกแท็บ Plugins -> กด Development -> กดปุ่ม '+' -> เลือก Import plugin from manifest...");
  console.log("   - เลือกชี้ไปที่ไฟล์โปรเจกต์นี้ที่: figma-plugin/manifest.json");
  console.log("\nเมื่อพร้อมแล้ว ให้กลับมาที่ Terminal นี้แล้วกด Enter...");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question("\nกด Enter เพื่อเริ่มวาดภาพอัตโนมัติ...", () => resolve()));
  rl.close();

  console.log("\n🔮 กำลังรันการทำงานอัตโนมัติบน Figma...");

  try {
    // โฟกัสหน้าต่างเบราว์เซอร์กลับมา
    await page.bringToFront();

    // 3. กด Shift + I เพื่อเรียกทรัพยากร/ปลั๊กอิน
    console.log("- กำลังเปิดแผงหน้าต่าง Resources (Shift+I)...");
    await page.keyboard.press("Shift+I");
    await page.waitForTimeout(1000);

    // 4. พิมพ์ชื่อปลั๊กอินลงในช่องค้นหา
    console.log("- กำลังพิมพ์ค้นหาปลั๊กอิน 'Jae Noi UX Flowchart Generator'...");
    // ป้องกันการพิมพ์ผิดช่อง ให้คลิกที่ช่องค้นหาหรือพิมพ์โดยตรง
    await page.keyboard.type("Jae Noi UX Flowchart Generator");
    await page.waitForTimeout(1500);

    // 5. กดปุ่ม Run ของปลั๊กอิน
    console.log("- กำลังกดปุ่ม Run เพื่อเปิดปลั๊กอิน...");
    // Figma วาดผลการค้นหาเป็น DOM เราสามารถหาปุ่ม Run หรือคลิกที่รายการแรกได้
    const runBtn = page.locator('button:has-text("Run"), [aria-label="Run plugin"], [data-testid="run-plugin"]').first();
    if (await runBtn.count() > 0) {
      await runBtn.click();
    } else {
      // ลองกด Enter เพื่อรันรายการแรกที่ไฮไลท์
      await page.keyboard.press("Enter");
    }
    
    await page.waitForTimeout(2000);

    // 6. ค้นหา Plugin Iframe
    console.log("- กำลังรอสลับโฟกัสไปยัง Iframe ของปลั๊กอิน...");
    const iframeElement = await page.waitForSelector("iframe", { timeout: 15000 });
    const frame = await iframeElement.contentFrame();
    if (!frame) {
      throw new Error("ไม่สามารถเชื่อมต่อกับ Iframe ของปลั๊กอินได้");
    }

    // 7. อัปโหลดภาพหน้าจอ 14 รูปเข้าไปใน Input ของปลั๊กอิน
    console.log("- กำลังอัปโหลดภาพหน้าจอ 14 รูปเข้าสู่บอร์ดดีไซน์...");
    const fileInput = await frame.waitForSelector("#file-input");
    await fileInput.setInputFiles(filesToUpload);
    await frame.waitForTimeout(1000);

    // 8. กดปุ่มสร้างแผนภาพ
    console.log("- กำลังคลิกปุ่มสร้าง Flowchart บน Canvas...");
    await frame.click("#btn-generate");

    // รอความสำเร็จ
    console.log("- กำลังคำนวณตำแหน่งและลากลูกศรบน Figma Canvas...");
    await page.waitForTimeout(8000);

    console.log("\n🎉 วาดแผนภาพ UX/UI Flowchart สำเร็จเรียบร้อยแล้วบนบอร์ด Figma ของคุณ!");
    console.log("กระบวนการเสร็จสิ้นแล้ว สามารถปิดเบราว์เซอร์นี้ได้เลยครับ\n");

  } catch (error) {
    console.error("\n❌ เกิดข้อผิดพลาดระหว่างรันการทำงานอัตโนมัติ:", error.message);
    console.log("คำแนะนำ: ตรวจสอบว่าคุณได้ทำการเปิดไฟล์ดีไซน์ Figma ค้างไว้ และได้โหลดปลั๊กอิน figma-plugin/manifest.json เข้าระบบเรียบร้อยแล้ว");
  } finally {
    // ปล่อยให้เบราว์เซอร์เปิดค้างไว้ให้ผู้ใช้เซฟงานก่อน
    console.log("กด Ctrl+C ใน Terminal นี้เพื่อปิดหน้าเบราว์เซอร์");
  }
}

function getSuffix(index) {
  const suffixes = {
    1: "storefront-desktop",
    2: "storefront-mobile",
    3: "cart-drawer-empty-mobile",
    4: "cart-drawer-items-mobile",
    5: "checkout-form-mobile",
    6: "order-success-mobile",
    7: "track-page-empty-mobile",
    8: "track-page-results-mobile",
    9: "admin-login-desktop",
    10: "admin-orders-desktop",
    11: "admin-rounds-desktop",
    12: "admin-products-desktop",
    13: "admin-storefront-desktop",
    14: "admin-mobile-dashboard"
  };
  return suffixes[index] || "";
}

main().catch(console.error);
