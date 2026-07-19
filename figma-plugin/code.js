figma.showUI(__html__, { width: 340, height: 480 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-flowchart') {
    try {
      // 1. โหลด Font ที่จำเป็นต้องใช้สำหรับวาด Label
      await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
        figma.loadFontAsync({ family: "Inter", style: "Bold" })
      ]);

      const images = msg.images;
      let prevCustomerFrame = null;
      let prevAdminFrame = null;
      
      let customerX = 0;
      let adminX = 0;
      
      const CUSTOMER_Y = 200;
      const ADMIN_Y = 1500;
      const SPACING = 120;

      // รายการหัวข้อภาษาไทยสำหรับแต่ละหน้าภาพตามตัวเลขนำหน้า
      const titlesMap = {
        "01": "1. หน้าแรกเจ๊น้อยบนเดสก์ท็อป (1280x800)",
        "02": "2. หน้าแรกเจ๊น้อยบนมือถือ (390x844)",
        "03": "3. เปิดหน้าตะกร้าเปล่าบนมือถือ",
        "04": "4. ตะกร้าสินค้าหลังจากกดเพิ่มรายการ",
        "05": "5. ฟอร์มกรอกที่อยู่จัดส่งและสแกนพร้อมเพย์",
        "06": "6. หน้ายืนยันการสั่งซื้อสำเร็จพร้อมรับเลขออเดอร์",
        "07": "7. หน้าติดตามออเดอร์สถานะว่างเปล่า",
        "08": "8. รายละเอียดประวัติและสถานะจัดส่งเมื่อค้นหาเบอร์โทร",
        "09": "9. หน้าจอล็อกอินเข้าสู่หลังบ้านแอดมิน (Desktop)",
        "10": "10. แผงควบคุมแอดมิน - แท็บประวัติออเดอร์ลูกค้า",
        "11": "11. แผงควบคุมรอบขาย - กำหนดวันส่งและลิมิตโควตา",
        "12": "12. แผงจัดการสินค้า - สลับลำดับ ลิมิตคลัง และอัปโหลด 5 รูป",
        "13": "13. แผงตั้งค่าหน้าร้าน - แก้ไขรายละเอียดร้านและภาพโปรโมท",
        "14": "14. แผงควบคุมแอดมินแสดงผลแบบ Responsive บนมือถือ"
      };

      for (const img of images) {
        // ดึงตัวเลขรหัสสองหลักแรกจากชื่อไฟล์ เช่น "01" หรือ "09"
        const prefix = img.name.substring(0, 2);
        const titleText = titlesMap[prefix] || img.name.replace(".png", "");
        
        // 2. สร้าง Image ออบเจกต์ใน Figma
        const figmaImage = figma.createImage(img.bytes);
        const originalSize = await figmaImage.getSizeAsync();
        
        // 3. กำหนดประเภทภาพ (Desktop / Mobile) และขนาดสัดส่วน
        const isDesktop = ["01", "09", "10", "11", "12", "13"].includes(prefix);
        let width = 0;
        let height = 0;

        if (isDesktop) {
          width = 1000;
          height = Math.round((originalSize.height / originalSize.width) * width);
        } else {
          width = 390;
          height = Math.round((originalSize.height / originalSize.width) * width);
        }

        // 4. สร้าง Frame สำหรับวางรูป
        const frame = figma.createFrame();
        frame.name = titleText;
        frame.resize(width, height);
        frame.fills = [{
          type: 'IMAGE',
          imageHash: figmaImage.hash,
          scaleMode: 'FILL'
        }];
        frame.effects = [{
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.15 },
          offset: { x: 0, y: 4 },
          radius: 12,
          spread: 0,
          visible: true,
          blendMode: 'NORMAL'
        }];
        frame.cornerRadius = 8;

        // 5. คำนวณตำแหน่งพิกัด X, Y บนบอร์ด
        const isCustomerFlow = parseInt(prefix) <= 8;
        if (isCustomerFlow) {
          frame.x = customerX;
          frame.y = CUSTOMER_Y;
          customerX += width + SPACING;
        } else {
          frame.x = adminX;
          frame.y = ADMIN_Y;
          adminX += width + SPACING;
        }

        // 6. สร้างตัวหนังสือ Label ด้านบนหัวข้อภาพ
        const textNode = figma.createText();
        textNode.fontName = { family: "Inter", style: "Bold" };
        textNode.characters = titleText;
        textNode.fontSize = 20;
        textNode.fills = [{ type: 'SOLID', color: { r: 0.827, g: 0.184, b: 0.184 } }]; // โทนแดงเจ๊น้อย
        textNode.x = frame.x;
        textNode.y = frame.y - 40;

        // 7. วาดลูกศรเชื่อม (Connector Line)
        if (isCustomerFlow) {
          if (prevCustomerFrame) {
            drawArrow(prevCustomerFrame, frame);
          }
          prevCustomerFrame = frame;
        } else {
          if (prevAdminFrame) {
            drawArrow(prevAdminFrame, frame);
          }
          prevAdminFrame = frame;
        }
      }

      // ซูมจอเข้าหาภาพที่สร้างเสร็จ
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);

      // ส่งข้อความกลับไปแจ้ง UI
      figma.ui.postMessage({ type: 'success' });
      figma.notify("สร้างแผนภาพ UX/UI Flowchart สำเร็จสมบูรณ์!");

    } catch (err) {
      console.error(err);
      figma.notify("เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : String(err)), { error: true });
    }
  }
};

function drawArrow(prevNode, currNode) {
  const prevRightX = prevNode.x + prevNode.width;
  const prevRightY = prevNode.y + (prevNode.height / 2);
  const currLeftX = currNode.x;
  const currLeftY = currNode.y + (currNode.height / 2);

  const line = figma.createLine();
  line.name = "Connector Arrow";
  
  const dx = currLeftX - prevRightX;
  const dy = currLeftY - prevRightY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  line.resize(distance, 0);
  line.x = prevRightX;
  line.y = prevRightY;
  line.rotation = Math.atan2(dy, dx) * (180 / Math.PI);
  
  line.strokes = [{ type: 'SOLID', color: { r: 0.827, g: 0.184, b: 0.184 } }];
  line.strokeWeight = 4;
  line.strokeCap = "ARROW_EQUILATERAL";
}
