# เจ๊น้อย เขียงหมูตะคร้อ

เว็บสั่งสินค้าและระบบหลังบ้านภาษาไทยสำหรับร้านเจ๊น้อย เขียงหมูตะคร้อ ออกแบบแบบ
mobile-first และรันบน Cloudflare Workers โดยใช้ D1 เป็นฐานข้อมูลหลักและ R2
สำหรับรูปสินค้า สลิป และข้อมูลประกอบที่ไม่ควรอยู่ในฐานข้อมูล

## สถานะระบบปัจจุบัน

- หน้าร้าน ลูกค้า และหลังบ้านใช้ข้อมูลจาก Cloudflare D1 แล้ว
- Google Sheets ไม่ได้อยู่ในเส้นทางทำงานปกติ เหลือไว้เฉพาะสคริปต์นำเข้าข้อมูลเก่า
- โค้ดหลังบ้านตรวจ Cloudflare Access JWT, audience, issuer และ email allowlist ซ้ำใน Worker
- Cloudflare Access edge policy สำหรับ `/admin*` และ `/api/admin/*` ต้องตั้งและตรวจใน
  Cloudflare Zero Trust หลัง deploy เพราะเป็นค่าภายนอก repository
- เว็บใช้งานจริงที่ **https://jaenoishop.com** ตั้งแต่ 3 ส.ค. 2569 URL `*.workers.dev`
  ทั้งหมดถูกปิดแล้วโดยตั้งใจ
- SlipOK **เปิดใช้งานบน production แล้ว** (3 ส.ค. 2569) แต่ยังไม่เคยทดสอบกับสลิปจริง
  ถ้าคีย์ผิดทุกสลิปจะตกไป `รอตรวจสลิป` ซึ่งเท่ากับพฤติกรรมเดิม ไม่ทำให้สลิปดีถูกปฏิเสธ
- Production deploy ผ่าน Cloudflare Worker ตามค่าที่กำหนดใน environment ของผู้ดูแล

## ความสามารถหลัก

### หน้าร้านและลูกค้า

- แสดงสินค้าแยกหมวดหมู่ พร้อมสถานะเปิดขาย ปิดชั่วคราว และรอข้อมูล
- ตะกร้าสินค้าและ checkout ที่เหมาะกับมือถือ
- เลือกรับเองหน้าร้านหรือจัดส่งไปรษณีย์
- เลือกจังหวัด อำเภอ ตำบล และเติมรหัสไปรษณีย์อัตโนมัติ
- สร้าง PromptPay QR จากยอดที่คำนวณฝั่งระบบ
- แนบสลิป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB โดยระบบถอดรหัสและเข้ารหัสใหม่
  ก่อนเก็บ เพื่อล้าง EXIF, metadata และข้อมูลที่อาจถูกต่อท้ายไฟล์
- ป้องกันการสร้างออเดอร์ซ้ำด้วย idempotency key
- กู้คืนตะกร้าและข้อมูลที่กรอกไว้เฉพาะ browser session ปัจจุบัน
  โดยตรวจราคาและสถานะสินค้าล่าสุดก่อนใช้
- ลูกค้าเลือกจำชื่อและที่อยู่บนอุปกรณ์ได้เองเป็นเวลา 90 วัน และลบข้อมูลที่จำไว้ได้
- ติดตามออเดอร์ด้วยเลขออเดอร์และเบอร์โทร 4 ตัวท้าย
  เพื่อไม่ให้ค้นประวัติทั้งหมดจากเบอร์โทรเพียงอย่างเดียว
- ดูบริษัทขนส่ง เลขพัสดุ ปุ่มคัดลอก และลิงก์ติดตามอย่างเป็นทางการจากหน้าติดตามออเดอร์
- ลูกค้ายืนยันว่าได้รับสินค้าแล้วได้ และระบบปิดงานอัตโนมัติเมื่อเกินระยะเวลาที่กำหนด
- ดาวน์โหลดใบยืนยันการชำระเงินเป็น PNG หรือพิมพ์/บันทึกเป็น PDF
- สินค้าที่รอบนั้นไม่ได้เปิดขายยังแสดงในกริดแต่กดเพิ่มไม่ได้ พร้อมป้าย "ไม่มีในรอบนี้"
  ถ้าเปิดหลายรอบพร้อมกันจะรวมสินค้าทุกรอบ แล้วแคบลงเมื่อเลือกรอบในตะกร้า
- สลิปที่ตรวจไม่ผ่าน แนบใหม่ได้อีก 1 ครั้งจากหน้าติดตามออเดอร์ พร้อม QR พร้อมเพย์
  เต็มยอดให้สแกนจ่ายซ้ำ ถ้ายังไม่ผ่านจะแสดงเบอร์ร้านให้ติดต่อโดยตรง

### ระบบหลังบ้าน

- ดูออเดอร์ แยกสถานะชำระเงินและสถานะจัดส่ง
- ป้องกันการเลื่อนออเดอร์ไปขั้นเตรียมหรือจัดส่งก่อนยืนยันการชำระเงิน
- นำเข้า Pickup List ของ Flash Express (`.xls`, `.xlsx`, `.csv`) เพื่อจับคู่เลขพัสดุ
  กับออเดอร์แบบพรีวิวก่อนบันทึก รองรับการเลือกเองเมื่อพบหลายออเดอร์ และไม่เขียนทับเลขเดิม
- เพิ่ม แก้ไข ปิดขาย และเปิดขายสินค้าอีกครั้ง
- อัปโหลดรูปสินค้า โลโก้ และภาพปกเข้า R2 หลังถอดรหัส ย่อ และเข้ารหัสใหม่เป็น WebP
- ลากการ์ดสินค้าเพื่อเรียงลำดับ รองรับ touch, mouse, keyboard และ auto-scroll
- สร้างและแก้ไขรอบขาย พร้อมสรุปยอดเฉพาะออเดอร์ที่ชำระแล้วและไม่ถูกยกเลิก
- กำหนดได้ว่าแต่ละรอบเปิดขายทั้งร้านหรือเลือกเฉพาะบางรายการ พร้อมพรีวิวสินค้าแบบมีรูป
  ค้นหา และกรองหมวดหมู่
- แท็บ "พิมพ์สติ๊กเกอร์" แยกออกมา พิมพ์หรือ export PNG ทั้งรอบได้ในคลิกเดียว
  ขนาด 77 × 30 มม. ตัดออเดอร์รับหน้าร้านออกให้อัตโนมัติ
- แยกยอดสินค้า ยอดค่าส่ง และยอดรวม พร้อมอันดับสินค้าขายดี ตามตัวกรองที่เลือกอยู่
- ลากชิปหมวดหมู่เพื่อจัดลำดับที่หน้าร้านแบบถาวร (เก็บใน `storefront_settings`)
- แก้ข้อความหน้าร้าน เบอร์โทร ค่าส่ง จุดรับสินค้า และข้อมูล PromptPay
- ตรวจการแก้ไขชนกันด้วย version/fingerprint และรีเฟรชข้อมูลในหน้าเดิม
- รักษาแท็บหลังบ้านผ่าน URL เช่น `/admin?tab=products` แท็บที่มี: `orders`,
  `stickers`, `rounds`, `products`, `storefront` (ตรวจค่าทั้งฝั่ง server ใน
  `app/admin/page.tsx` และฝั่ง client ใน `app/admin/dashboard.tsx` — เพิ่มแท็บใหม่ต้องแก้ทั้งสองที่)

## สถาปัตยกรรม

| ส่วน | หน้าที่ |
| --- | --- |
| Next.js + React + vinext | App Router, UI, Server Components และ API routes |
| Cloudflare Workers | รันเว็บและ API ที่ edge |
| Cloudflare D1 (`DB`) | สินค้า รอบขาย การตั้งค่าร้าน ออเดอร์ และรายการสินค้า |
| R2 `UPLOADS` | สลิป, session หลังบ้าน, rate limit, idempotency receipt และ storefront snapshot |
| R2 `PRODUCT_MEDIA` | รูปสินค้า โลโก้ และภาพปก |
| Cloudflare Images (`IMAGES`) | ถอดรหัส ย่อ และเข้ารหัสรูปอัปโหลดใหม่ก่อนเก็บ รวมถึง optimize รูปหน้าร้าน |
| Cloudflare Access | ควบคุมสิทธิ์เข้าหลังบ้านใน production |
| SlipOK | ตรวจสลิปแบบเลือกเปิด ใช้ server-side เท่านั้น |
| Sentry | รับเหตุผิดปกติที่ตัดข้อมูลลูกค้าออกแล้ว |

หน้า `/api/storefront` อ่าน D1 และ cache ที่ edge 30 วินาที เมื่ออ่านข้อมูลสดไม่ได้
ระบบสามารถใช้ last-known-good snapshot จาก R2 ชั่วคราวแทนได้ การแก้ข้อมูลจากหลังบ้าน
จะล้าง cache ของหน้าร้านทันที

## โครงสร้างโปรเจกต์

```text
app/                 หน้าเว็บ, หลังบ้าน และ API routes
app/_components/     UI ของหน้าร้านและ checkout
app/admin/           dashboard, login และ dialog ของผู้ดูแล
db/                  repository สำหรับ D1 และ schema อ้างอิง
lib/                 validation, auth, tracking, rate limit และ monitoring
migrations/          migration SQL ที่ใช้กับ D1 จริง
drizzle/             ผลจาก drizzle-kit สำหรับเทียบ schema ไม่ใช่ migration production
worker/              Cloudflare Worker entry point และ image optimization
scripts/             setup, doctor, import, build guard และ deployment helpers
tests/               Node unit/integration tests
tests-e2e/           Playwright browser tests
docs/                คู่มือ production, monitoring และ SlipOK
```

## เริ่มพัฒนา

### ความต้องการ

- Node.js `>=22.15.0` (ใช้ `.nvmrc` เป็นตัวอ้างอิง)
- npm
- Wrangler CLI login เฉพาะเมื่อต้องใช้ D1 staging หรือ deploy

### ตั้งค่าครั้งแรก

```bash
npm install
cp .env.example .env.local
```

สร้างรหัสผ่าน local เป็น hash โดยไม่เก็บรหัสจริงลงไฟล์:

```bash
ADMIN_PASSWORD='ตั้งรหัสชั่วคราวที่เดายาก' npm run admin:hash-password
```

นำ hash ที่ได้ไปใส่ `ADMIN_PASSWORD_HASH` ใน `.env.local` และสร้าง
`ADMIN_AUTH_SECRET` แบบสุ่มอย่างน้อย 32 bytes เช่น:

```bash
openssl rand -hex 32
```

จากนั้นรัน:

```bash
npm run dev:setup
npm run dev
```

`dev:setup` รวมค่าจาก `.env`, `.env.local` และ `.dev.vars` เดิม แล้วสร้าง
`.dev.vars` ที่ permission `0600` พร้อมบังคับค่าปลอดภัยสำหรับเครื่องพัฒนา:

- `APP_ENV=development`
- `ALLOW_DEV_WRITES=false`
- `SLIPOK_ENABLED=false`
- ตัด Google service-account credentials ออกจาก runtime ปกติ

เปิดเว็บที่ `http://localhost:3000`

### โหมดฐานข้อมูลสำหรับ local

| คำสั่ง | ฐานข้อมูล | เหมาะกับ |
| --- | --- | --- |
| `npm run dev` | Miniflare D1 ในเครื่อง | พัฒนา UI และข้อมูลทดสอบโดยไม่แตะ D1 จริง |
| `npm run dev:remote-db` | D1 staging จริง | ทดสอบ integration และการเขียนข้อมูลเหมือน production |

ก่อนใช้ `dev:remote-db` ต้อง:

1. login Wrangler ด้วย `npx wrangler whoami`
2. ตั้ง `ALLOW_DEV_WRITES=true` ใน `.dev.vars`
3. ยอมรับว่าการเพิ่ม/แก้/ลบข้อมูลจะเกิดขึ้นจริงในฐาน staging

โหมดนี้ล็อก database name และ ID ไว้ที่ staging ใน
`scripts/local-remote-d1.mjs` และไม่เลือก production จาก environment ภายนอก

หมายเหตุ: `ALLOW_DEV_WRITES` เป็น safety gate สำหรับการเปิดโหมด remote staging
ไม่ใช่ firewall ของทุก API ส่วน `PRODUCT_MEDIA` ใน local ถูกตั้งให้ใช้ R2 แบบ remote
เพื่อให้ทดสอบรูปจริงได้ ดังนั้นการอัปโหลดรูปจากหลังบ้าน local จะเขียนเข้า bucket
ที่กำหนดใน environment จริง แม้ D1 จะเป็น Miniflare

หากเป็นเครื่องใหม่และ local D1 ยังไม่มี schema ให้ build config แล้ว apply
migration จาก source of truth:

```bash
npm run build
npx wrangler d1 migrations apply site-creator-d1 \
  --local --config dist/server/wrangler.json
```

ใส่ข้อมูลตัวอย่างเฉพาะฐาน local ได้ด้วย:

```bash
npx wrangler d1 execute site-creator-d1 \
  --local --config dist/server/wrangler.json --file scripts/seed.sql
```

`scripts/seed.sql` ใช้ `INSERT OR REPLACE` จึงควรใช้กับ local ที่ตั้งใจเป็นข้อมูล
ทดสอบเท่านั้น ห้ามเปลี่ยน `--local` เป็น `--remote`

## Environment และ secrets

ใช้ `.env.example` เป็นรายการค่าที่ระบบรองรับ แต่ห้าม commit `.env`,
`.env.local`, `.dev.vars`, private key, API key, password หรือรายชื่ออีเมลผู้ดูแล

### Local runtime

- `APP_ENV`
- `ALLOW_DEV_WRITES`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_AUTH_SECRET`
- `ADMIN_PASSWORD_FALLBACK_ENABLED`
- `PRODUCT_MEDIA_ORIGIN`
- `SLIPOK_*` และ `SENTRY_*` เมื่อจำเป็น

### Cloudflare build settings

- `CLOUDFLARE_WORKER_NAME`
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME`
- `CLOUDFLARE_CUSTOM_DOMAIN` — ต้องเป็น `jaenoishop.com` เสมอ ถ้าเว้นว่าง build จะถอด
  route ของโดเมนออกและหน้าร้านจะล่ม
- `PRODUCT_MEDIA_ORIGIN`

### Production runtime secrets

ตั้งผ่าน Cloudflare/Wrangler เท่านั้น:

- `ADMIN_AUTH_SECRET`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_PASSWORD_FALLBACK_ENABLED`
- `ADMIN_ALLOWED_EMAILS`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_AUD`
- `SLIPOK_BRANCH_ID`, `SLIPOK_API_KEY`, `SLIPOK_ENABLED`
- `SENTRY_DSN`

ค่ากลุ่ม `GOOGLE_*` ใช้เฉพาะ `scripts/export-sheet-orders-to-d1-sql.mjs`
เมื่อต้องนำเข้าข้อมูลเก่าจาก Google Sheets ไม่ได้ถูกใช้โดยหน้าร้านหรือหลังบ้านปัจจุบัน

## ฐานข้อมูลและ migration

ไฟล์จริงสำหรับ production อยู่ใน `migrations/*.sql`:

1. `0001_orders.sql` — ออเดอร์และรายการสินค้า
2. `0002_storefront_cms.sql` — สินค้า รอบขาย และการตั้งค่าหน้าร้าน
3. `0003_order_shipped_at.sql` — เวลาเริ่มจัดส่ง/พร้อมรับ
4. `0004_orders_round_id_index.sql` — index สำหรับสรุปออเดอร์ตามรอบ
5. `0005_round_products.sql` — ขอบเขตสินค้าที่เปิดขายแยกตามรอบ
6. `0006_tracking_imports.sql` — บริษัทขนส่ง ประวัตินำเข้า และตัวคุมเลขพัสดุซ้ำ
7. `0007_slip_retries.sql` — โควตาแนบสลิปใหม่ของลูกค้า

**รัน migration ให้เสร็จก่อน deploy เสมอ** ถ้า deploy โค้ดที่อ่านคอลัมน์ที่ยังไม่มี
หน้า admin จะพังทั้งหน้า (เคยเกิดจริงกับ `carrier_code` ตอน `0006`)

`db/schema.ts` ต้องแก้ให้ตรงกับ migration แต่ `drizzle/*.sql` ไม่ถูก apply เข้า
production โดยอัตโนมัติ อ่านรายละเอียด schema และข้อควรระวังได้ที่
[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

### นำเข้าเลขพัสดุจากบริษัทขนส่ง

1. เปิดหลังบ้านที่แท็บ `ออเดอร์` แล้วเลือกไฟล์ Pickup List
2. กด `ตรวจไฟล์และพรีวิว` ระบบจะจับคู่ด้วยเลขออเดอร์ก่อน และใช้เบอร์โทรเมื่อไฟล์ไม่มีเลขออเดอร์
3. ตรวจรายการที่จับคู่ได้ เลือกออเดอร์เองเฉพาะแถวที่กำกวม แล้วกดยืนยันนำเข้า
4. ระบบอัปเดตเฉพาะออเดอร์จัดส่งที่ชำระแล้ว เปลี่ยนเป็น `จัดส่งแล้ว` และแสดงเลขพัสดุให้ลูกค้า

ไฟล์ถูกอ่านในหน่วยความจำและไม่ถูกเก็บไว้ ขนาดสูงสุด 2 MB หรือ 500 แถว
และระบบไม่เขียนทับเลขพัสดุเดิม การนำเข้าไฟล์เดิมซ้ำจะคืนผลเดิมโดยไม่แก้ข้อมูลซ้ำ
ปัจจุบันรองรับ Flash Express; ผู้ให้บริการรายถัดไปควรเพิ่ม adapter และ tracking URL
ใน `lib/carriers.ts` กับตัวแปลงหัวตารางใน `lib/tracking-import.ts`

หลัง build สำหรับ Cloudflare ให้ตรวจ migration ก่อน apply:

```bash
npx wrangler d1 migrations list "$CLOUDFLARE_D1_DATABASE_NAME" \
  --remote --config dist/server/wrangler.json

npx wrangler d1 migrations apply "$CLOUDFLARE_D1_DATABASE_NAME" \
  --remote --config dist/server/wrangler.json
```

ตรวจชื่อ database และ account ทุกครั้งก่อนตอบ `yes` เพราะคำสั่ง `--remote`
เปลี่ยนฐานข้อมูลจริง

## คำสั่งสำคัญ

| คำสั่ง | ใช้ทำอะไร |
| --- | --- |
| `npm run dev` | เปิด local server กับ Miniflare |
| `npm run dev:remote-db` | เปิด local UI กับ D1 staging |
| `npm run dev:doctor` | ตรวจ local config และพอร์ต 3000 |
| `npm run build` | build สำหรับตรวจในเครื่อง |
| `npm run lint` | ตรวจ ESLint |
| `npx tsc --noEmit` | ตรวจ TypeScript |
| `npm test` | build และรัน Node tests |
| `npm run test:e2e` | รัน Playwright บนมือถือและเดสก์ท็อป |
| `npm audit --omit=dev` | ตรวจช่องโหว่ dependency ที่ถูกใช้ใน production |
| `npm run db:generate` | สร้าง Drizzle diff เพื่อช่วยตรวจ schema |
| `npm run db:export-sheet-orders` | สร้าง SQL สำหรับนำเข้าข้อมูลเก่าจาก Sheets |
| `npm run build:cloudflare` | build production และผูก config ที่ระบุชัด |
| `npm run deploy:cloudflare` | build, ตรวจ bindings และ deploy Worker |

## ตรวจสอบก่อน push หรือ deploy

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:e2e
npm audit --omit=dev
```

E2E ไม่ส่งออเดอร์จริง แต่ตรวจ validation, ที่อยู่, PromptPay summary และ layout
บน viewport มือถือ/เดสก์ท็อป

## Deploy ไป Cloudflare

1. ตรวจ account:

   ```bash
   npx wrangler whoami
   ```

2. โหลด build settings ที่ไม่ใช่ secret จาก `.env`:

   ```bash
   set -a
   source .env
   set +a
   ```

3. Build และตรวจ bindings:

   ```bash
   npm run build:cloudflare
   node scripts/assert-cloudflare-dist.mjs
   ```

4. ตรวจและ apply migration ที่รออยู่ตามหัวข้อฐานข้อมูล

5. Deploy:

   ```bash
   npm run deploy:cloudflare
   ```

6. ตรวจอย่างน้อย:

   - `/` และ `/api/storefront` ตอบ `2xx`
   - HTTP ถูก redirect ไป HTTPS และ HTTPS response มี HSTS
   - response มี CSP, `X-Frame-Options`, `X-Content-Type-Options`,
     `Referrer-Policy` และ `Permissions-Policy`
   - `/admin` และ `/api/admin/*` ถูกส่งไป Cloudflare Access เมื่อยังไม่ล็อกอิน
   - `/api/orders/track` ต้องใช้เลขออเดอร์และเบอร์โทร 4 ตัวท้าย
   - อัปโหลดรูปสินค้าและสลิปจริงได้ แสดงผลได้ และ object ที่เก็บเป็นไฟล์เข้ารหัสใหม่
   - D1 ไม่มี migration ค้าง
   - bindings `DB`, `UPLOADS`, `PRODUCT_MEDIA` และ `IMAGES` ชี้ resource production ที่ถูกต้อง
   - หน้า Admin อ่านออเดอร์ สินค้า รอบขาย และรูปจาก bindings production ที่ถูกต้อง

`scripts/check-cloudflare-build-env.mjs` และ `scripts/assert-cloudflare-dist.mjs`
จะหยุด deployment หาก Worker, D1 หรือ R2 ไม่ตรงกับค่าที่กำหนด แต่ไม่แทนการตรวจ
account และ database ด้วยตนเอง

## ความปลอดภัยและความเป็นส่วนตัว

- HTTP ที่ไม่ใช่ localhost ถูก redirect ไป HTTPS และ HTTPS เปิด HSTS
- Worker ใส่ CSP, SAMEORIGIN framing, `nosniff`, referrer policy และ permissions policy
  ให้ทั้งหน้าเว็บ API และ media response
- Permissions Policy ปิดกล้อง ไมโครโฟน ตำแหน่ง screen capture, sensor,
  Bluetooth, USB, serial และอุปกรณ์ XR เพราะหน้าร้านไม่จำเป็นต้องใช้
  โดยยังคง clipboard และ Web Share ที่ลูกค้าเป็นผู้กดใช้งานเอง
- Production ควรใช้ Cloudflare Access ที่ edge และโค้ดตรวจ Access JWT, issuer,
  audience และ email allowlist ซ้ำใน Worker
- Password fallback ใช้ PBKDF2 และควรปิดใน production ด้วย `ADMIN_PASSWORD_FALLBACK_ENABLED=false`
- Mutation หลังบ้านต้องผ่าน session และ same-origin check
- การนำเข้าเลขพัสดุต้องผ่านสิทธิ์หลังบ้าน, same-origin, rate limit, magic-byte/header
  validation และยืนยันซ้ำกับสถานะออเดอร์ใน D1 ตอนบันทึกจริง
- API ติดตามออเดอร์ใช้เลขออเดอร์แบบสุ่มร่วมกับเบอร์โทร 4 ตัวท้าย
  และไม่ส่งชื่อ ที่อยู่เต็ม หรือรูปสลิปกลับไปยังลูกค้า
- การสร้างออเดอร์จำกัด 6 ครั้งต่อ 30 นาทีต่อ IP และ 3 ครั้งต่อ 60 นาทีต่อเบอร์โทร
- การค้นหาออเดอร์จำกัด 8 ครั้งต่อ 15 นาทีต่อ IP
- ทุก JSON และ multipart endpoint มีเพดานขนาด request body และตรวจขนาดจาก stream
  ก่อน parse เพื่อไม่ให้ request ขนาดใหญ่กินหน่วยความจำ Worker
- สลิปและรูปตรวจ signature จาก bytes แล้วใช้ Cloudflare Images ถอดรหัสและเข้ารหัสใหม่
  ระบบจะปฏิเสธไฟล์เมื่อถอดรหัสไม่ได้หรือไม่มี `IMAGES` binding
- Automatic checkout draft ที่มีข้อมูลติดต่อใช้ `sessionStorage` ส่วนข้อมูลที่ลูกค้า
  เลือกให้จำใช้ `localStorage` อายุไม่เกิน 90 วัน
- Monitoring ตัดข้อมูลลูกค้า request body, cookie, authorization และ raw error ออก

ข้อจำกัดที่ทราบ: vinext ยังสร้าง inline React Server Component bootstrap scripts
และไม่มี per-request nonce hook ในปัจจุบัน จึงต้องอนุญาต inline script ใน CSP
จนกว่าจะรองรับ nonce โดย CSP ยังคงห้าม third-party script, object, cross-origin form
และ third-party framing

## เอกสารเพิ่มเติม

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — schema และ workflow ของ D1 migration
- [docs/cloudflare-client-handoff.md](./docs/cloudflare-client-handoff.md) — การส่งมอบและตั้งค่า Cloudflare
- [docs/monitoring.md](./docs/monitoring.md) — Sentry, quota และ incident response
- [docs/slipok-integration.md](./docs/slipok-integration.md) — สถานะ SlipOK และวิธีปิดกลับ
- [CLAUDE.md](./CLAUDE.md) — ข้อควรระวังตอน deploy, custom domain และการทำงานพร้อมกันหลาย agent
- [figma-plugin/README.md](./figma-plugin/README.md) — เครื่องมือช่วยบันทึกและทบทวน UX/UI ใน Figma
