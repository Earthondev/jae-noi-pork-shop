import { createHash, createSign } from "node:crypto";
import { writeFile } from "node:fs/promises";

const sheetId = required("GOOGLE_SHEET_ID");
const email = required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const privateKey = required("GOOGLE_PRIVATE_KEY").replaceAll("\\n", "\n");
const outputPath = process.argv[2] || "/tmp/jae-noi-orders-import.sql";

const token = await accessToken();
const [orders, items, rounds, productRows, roundRows, settingRows] = await Promise.all([
  values("ออเดอร์!A2:R", token),
  values("รายการออเดอร์!A2:H", token),
  values("รอบจัดส่ง!A2:B", token),
  values("สินค้า!A2:J", token, "UNFORMATTED_VALUE"),
  values("รอบจัดส่ง!A2:J", token, "UNFORMATTED_VALUE"),
  values("ตั้งค่าร้าน!A2:D", token, "UNFORMATTED_VALUE"),
]);
const deliveryDates = new Map(rounds.filter((row) => row[0]).map((row) => [String(row[0]), String(row[1] ?? "")]));
const orderIds = new Set(orders.filter((row) => row[0]).map((row) => String(row[0])));
const statements = [];

for (const row of orders) {
  if (!row[0]) continue;
  const id = String(row[0]);
  const fulfilment = row[5] === "รับเองหน้าร้าน" ? "pickup" : "postal";
  const createdAt = String(row[2] ?? "");
  statements.push(`INSERT OR IGNORE INTO orders (
    id, round_id, delivery_date, customer_name, phone, phone_normalized, fulfilment, address,
    address_line, subdistrict, district, province, postal_code, note, admin_note, subtotal,
    shipping_fee, total, slip_key, payment_status, order_status, tracking_number,
    idempotency_key, created_at, updated_at
  ) VALUES (${[
    id, row[1], deliveryDates.get(String(row[1] ?? "")) ?? "", row[3], row[4], normalizePhone(row[4]),
    fulfilment, row[6], "", "", "", "", "", row[13], row[14], number(row[7]), number(row[8]),
    number(row[9]), row[10] || null, paymentStatus(row[11]), orderStatus(row[12]), row[16] || null,
    row[17] || `legacy-${id}`, createdAt, row[15] || createdAt,
  ].map(sql).join(", ")});`);
}

for (const row of items) {
  const orderId = String(row[1] ?? "");
  if (!orderIds.has(orderId)) continue;
  statements.push(`INSERT INTO order_items (order_id, product_id, name, quantity, unit_price)
    SELECT ${[orderId, row[2], row[3], number(row[4]), number(row[5])].map(sql).join(", ")}
    WHERE NOT EXISTS (
      SELECT 1 FROM order_items WHERE order_id = ${sql(orderId)} AND product_id = ${sql(row[2])}
        AND name = ${sql(row[3])} AND quantity = ${sql(number(row[4]))} AND unit_price = ${sql(number(row[5]))}
    );`);
}

const products = productRows.filter((row) => row[0]);
const cmsRounds = roundRows.filter((row) => row[0]);
const settings = settingRows.filter((row) => row[0]);
const importedAt = new Date().toISOString();
const cmsFingerprint = createHash("sha256")
  .update(JSON.stringify({ products, rounds: cmsRounds, settings }))
  .digest("hex");

statements.push("DELETE FROM products;");
for (const [index, row] of products.entries()) {
  statements.push(`INSERT INTO products (
    id, name, unit, detail, price, status, image_url, category, sort_order, version, updated_at
  ) VALUES (${[
    row[0], row[1], row[2] ?? "", row[3] ?? "", optionalNumber(row[4]), productStatus(row[5]),
    row[8] ?? "", row[9] || "อื่น ๆ", index + 1, 1, row[7] || importedAt,
  ].map(sql).join(", ")});`);
}

statements.push("DELETE FROM delivery_rounds;");
for (const row of cmsRounds) {
  statements.push(`INSERT INTO delivery_rounds (
    id, delivery_date, opens_at, closes_at, status, label, note, version, updated_at
  ) VALUES (${[
    row[0], dateInput(row[1]), dateTimeInput(row[2]), dateTimeInput(row[3]), roundStatus(row[4]),
    row[5] ?? "", row[6] ?? "", 1, importedAt,
  ].map(sql).join(", ")});`);
}

statements.push("DELETE FROM storefront_settings;");
for (const row of settings) {
  statements.push(`INSERT INTO storefront_settings (key, value, purpose, status, version, updated_at)
    VALUES (${[row[0], row[1] ?? "", row[2] ?? "", row[3] || "พร้อมใช้", 1, importedAt].map(sql).join(", ")});`);
}
statements.push(`INSERT OR IGNORE INTO cms_imports (
  source, source_fingerprint, product_count, round_count, setting_count, imported_at
) VALUES (${["google-sheets", cmsFingerprint, products.length, cmsRounds.length, settings.length, importedAt].map(sql).join(", ")});`);

await writeFile(outputPath, `${statements.join("\n")}\n`, { mode: 0o600 });
const sourceTotals = orders.filter((row) => row[0]).reduce((totals, row) => ({
  subtotal: totals.subtotal + number(row[7]),
  shipping: totals.shipping + number(row[8]),
  total: totals.total + number(row[9]),
}), { subtotal: 0, shipping: 0, total: 0 });
console.log(`Prepared ${orderIds.size} orders, ${items.length} item rows, ${products.length} products, ${cmsRounds.length} rounds, and ${settings.length} settings at ${outputPath}`);
console.log(`Source totals: subtotal ${sourceTotals.subtotal}, shipping ${sourceTotals.shipping}, total ${sourceTotals.total}`);
console.log(`CMS source fingerprint: ${cmsFingerprint}`);
console.log("Review the file, apply it to the intended D1 database, and compare counts and totals before deployment.");

async function values(range, bearer, valueRenderOption = "FORMATTED_VALUE") {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
  const requestUrl = `${url}?valueRenderOption=${encodeURIComponent(valueRenderOption)}`;
  const response = await fetch(requestUrl, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!response.ok) throw new Error(`Google Sheets read failed for ${range}: ${response.status}`);
  const body = await response.json();
  return Array.isArray(body.values) ? body.values : [];
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status}`);
  const body = await response.json();
  if (typeof body.access_token !== "string") throw new Error("Google OAuth returned no access token");
  return body.access_token;
}

function base64Url(value) { return Buffer.from(value).toString("base64url"); }
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function normalizePhone(value) { return String(value ?? "").replace(/\D/g, ""); }
function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
function optionalNumber(value) { return value === "" || value === undefined || value === null ? null : number(value); }
function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
function paymentStatus(value) {
  return ({ "รอตรวจสลิป": "waiting_for_slip_review", "ชำระแล้ว": "paid", "สลิปไม่ถูกต้อง": "invalid_slip", "คืนเงินแล้ว": "refunded" })[value] ?? "waiting_for_payment";
}
function orderStatus(value) {
  return ({ "กำลังเตรียม": "preparing", "พร้อมรับหน้าร้าน": "ready_for_pickup", "จัดส่งแล้ว": "shipped", "สำเร็จ": "completed", "ยกเลิก": "cancelled" })[value] ?? "received";
}
function productStatus(value) {
  if (value === "หยุดขาย") return "ปิดชั่วคราว";
  return ["เปิดขาย", "ปิดชั่วคราว", "รอข้อมูล", "ซ่อนสินค้า"].includes(value) ? value : "รอข้อมูล";
}
function roundStatus(value) {
  return ["เตรียมเปิด", "เปิดรับ", "ปิดรับ", "จัดส่งแล้ว", "ยกเลิก"].includes(value) ? value : "เตรียมเปิด";
}
function dateInput(value) { return serialInput(value, false); }
function dateTimeInput(value) { return serialInput(value, true); }
function serialInput(value, includeTime) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return includeTime ? value.slice(0, 16) : value.slice(0, 10);
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const date = new Date((serial - 25_569) * 86_400_000);
  const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return includeTime ? `${day}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}` : day;
}
