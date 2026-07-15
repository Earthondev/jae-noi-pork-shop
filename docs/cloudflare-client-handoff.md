# ส่งมอบเว็บให้ลูกค้าบน Cloudflare

เอกสารนี้ใช้สำหรับรูปแบบที่ลูกค้าเป็นเจ้าของระบบ แต่ผู้พัฒนายังดูแลโค้ดและ
เพิ่มฟีเจอร์ให้ต่อได้ โดยไม่ต้องใช้รหัสผ่านบัญชีของลูกค้าร่วมกัน

## การแบ่งความเป็นเจ้าของ

| ทรัพย์สิน | เจ้าของที่แนะนำ | สิทธิ์ผู้พัฒนา |
| --- | --- | --- |
| โดเมนและบัญชี Cloudflare | ลูกค้า | สมาชิกที่ดูแล Workers, R2, DNS และ Access |
| Google Sheet ออเดอร์ | ลูกค้า | เข้าถึงเท่าที่จำเป็นผ่านบัญชีระบบ |
| SlipOK และบัญชีรับเงิน | ลูกค้า | ตั้งค่าผ่าน secret โดยไม่เก็บใน Git |
| GitHub repository | ลูกค้าหรือองค์กรโครงการ | Maintainer |
| Source code และการ deploy | ตามสัญญาส่งมอบ | ผู้พัฒนาดูแลต่อผ่าน GitHub |

ไม่ควรขอรหัสผ่าน Cloudflare, Google หรือ SlipOK ของลูกค้า ให้ลูกค้าเชิญผู้พัฒนา
เป็นสมาชิกและให้สิทธิ์เฉพาะส่วนที่จำเป็น

## สิ่งที่ต้องขอจากลูกค้า

1. อีเมลเจ้าของร้านและผู้ดูแลสำหรับล็อกอินหลังบ้าน
2. บัญชี Cloudflare ที่ยืนยันอีเมลแล้ว
3. โดเมนหรือชื่อโดเมนที่ต้องการซื้อ
4. Google Sheet ที่ลูกค้าเป็นเจ้าของ
5. บัญชี SlipOK เมื่อพร้อมเปิดตรวจสลิปจริง

## ตั้งค่า Cloudflare

1. เพิ่มโดเมนในบัญชี Cloudflare ของลูกค้า
2. เชิญผู้พัฒนาเป็นสมาชิก โดยใช้สิทธิ์ Workers Platform Admin, DNS และ
   Workers, R2 และ DNS เฉพาะบัญชีหรือโดเมนนี้ ไม่ใช้ Super Administrator
3. สร้าง R2 bucket ส่วนตัวสำหรับสลิปชื่อเดียวกับ `CLOUDFLARE_R2_BUCKET_NAME`
4. สร้าง R2 bucket รูปสินค้าชื่อเดียวกับ `CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME`
   และห้ามนำสลิปหรือข้อมูลลูกค้าไปเก็บใน bucket รูปสินค้า
5. เปิด Cloudflare Zero Trust และสร้าง Access application เดียวที่มีปลายทาง
   `/admin*` และ `/api/admin/*`
6. เพิ่ม Google เป็น identity provider และคง One-time PIN ไว้เป็นวิธีสำรอง
7. สร้าง Allow policy แบบ Emails โดยระบุเฉพาะอีเมลเจ้าของร้านและผู้ดูแล
8. ตั้ง session 6 ชั่วโมง และทดสอบทั้ง Google กับ OTP ก่อนปิดรหัสผ่านสำรอง
9. เก็บรหัสผ่านสำรองที่เดายากไว้นอก Git แล้วตั้ง
   `ADMIN_PASSWORD_FALLBACK_ENABLED=false` ในระบบจริง

## Build variables ที่ไม่ใช่ความลับ

ตั้งสองค่านี้ใน Cloudflare Workers Builds:

```text
CLOUDFLARE_CUSTOM_DOMAIN=
CLOUDFLARE_R2_BUCKET_NAME=jae-noi-pork-shop-uploads
CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME=jae-noi-pork-shop-media
PRODUCT_MEDIA_ORIGIN=https://pub-example.r2.dev
```

`CLOUDFLARE_CUSTOM_DOMAIN` เว้นว่างได้ระหว่างที่ร้านยังไม่มีโดเมน ระบบจะเปิดผ่าน
`workers.dev` ก่อน เมื่อซื้อโดเมนแล้วจึงใส่ hostname และ deploy ใหม่

Build command:

```text
npm run build:cloudflare
```

เผยแพร่จริงผ่าน `npm run deploy:cloudflare` เท่านั้น คำสั่งนี้ตรวจซ้ำว่า
`UPLOADS` และ `PRODUCT_MEDIA` ชี้ไป bucket production ก่อนอัปโหลด ห้ามเรียก
`wrangler deploy --config dist/server/wrangler.json` หลัง `npm test` หรือ
`npm run build` โดยตรง เพราะสองคำสั่งนั้นสร้างไฟล์สำหรับทดสอบในเครื่อง

Deploy command:

```text
npx wrangler deploy --config dist/server/wrangler.json
```

## Runtime secrets

ตั้งค่าเหล่านี้เป็น **Secret/Encrypt** ใน Worker ห้ามตั้งเป็น plaintext build
variable และห้ามเก็บใน `.env` ที่ commit ขึ้น Git:

```text
ADMIN_PASSWORD_HASH
ADMIN_AUTH_SECRET
ADMIN_ALLOWED_EMAILS
ADMIN_PASSWORD_FALLBACK_ENABLED
CLOUDFLARE_ACCESS_TEAM_DOMAIN
CLOUDFLARE_ACCESS_AUD
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
SLIPOK_ENABLED
SLIPOK_BRANCH_ID
SLIPOK_API_KEY
```

`ADMIN_ALLOWED_EMAILS` เป็นอีเมลคั่นด้วย comma และต้องตรงกับ Access policy
ทุกตัวอักษร `CLOUDFLARE_ACCESS_TEAM_DOMAIN` ต้องเป็น URL `https://...cloudflareaccess.com`
และ `CLOUDFLARE_ACCESS_AUD` คัดลอกจาก Additional settings ของ application
เดียวที่ป้องกันทั้งหน้าและ API ส่วน `ADMIN_USERNAME=admin` จะถูกใส่เป็นค่าที่
ไม่ลับใน build อัตโนมัติ

สร้าง `ADMIN_PASSWORD_HASH` ด้วย `npm run admin:hash-password` และสร้าง
`ADMIN_AUTH_SECRET` เป็นค่าสุ่มอย่างน้อย 32 bytes ค่าทั้งสองเก็บไว้เพื่อ rollback
แต่ระบบจริงต้องปิดทางนี้ด้วย `ADMIN_PASSWORD_FALLBACK_ENABLED=false`
ส่วน `SLIPOK_ENABLED` ต้องคงเป็น `false` จนกว่าจะผูกบัญชีธนาคาร

ตัวสร้าง hash ใช้ PBKDF2-SHA256 ที่ 100,000 รอบ ซึ่งเป็นจำนวนสูงสุดที่ Web Crypto
ของ Cloudflare Workers runtime รองรับในปัจจุบัน
ตรวจโควต้า และทดสอบสลิปเงินจริงผ่าน

## ลำดับเปิดใช้งานโดยไม่กระทบเว็บเดิม

1. สร้าง staging subdomain ใน Cloudflare ลูกค้า
2. Build และ deploy จาก GitHub
3. ใส่ secrets และทดสอบการอ่าน/เขียน Google Sheet
4. ทดสอบออเดอร์, QR, แนบสลิป, ติดตามสถานะ และหลังบ้านบนมือถือ
5. ยืนยันว่าอีเมลอื่นเข้า `/admin` และ `/api/admin/*` ไม่ได้ และหน้าร้าน `/`
   ยังเปิดโดยไม่ต้องล็อกอิน
6. สำรอง Google Sheet และทดสอบกู้คืน
7. เปลี่ยนโดเมนจริงเข้าระบบใหม่
8. เก็บ Sites เดิมเป็น rollback ชั่วคราว ก่อนปิดเมื่อระบบใหม่เสถียร

## เงื่อนไขก่อนเปิดขายจริง

- ราคา น้ำหนัก ค่าส่ง รอบจัดส่ง และที่อยู่รับเองครบถ้วน
- พร้อมเพย์แสดงชื่อผู้รับถูกต้อง
- Google Sheet ไม่เปิดแชร์สาธารณะ
- รหัสหลังบ้านและอีเมล allowlist ไม่อยู่ใน Git, Google Sheets หรือเอกสารที่แชร์สาธารณะ
- Worker ตรวจ `Cf-Access-Jwt-Assertion` ด้วย issuer, audience และ allowlist ที่ถูกต้อง
- สลิปและข้อมูลลูกค้าไม่ถูกส่งกลับจาก API สาธารณะ
- ทดสอบสั่งซ้ำ, เน็ตหลุด, ไฟล์สลิปผิดประเภท และการค้นหาออเดอร์ถี่เกินกำหนด
- มีข้อความนโยบายจัดส่ง ยกเลิก คืนเงิน และความเป็นส่วนตัวให้ลูกค้าอ่าน
