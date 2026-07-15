import { importPKCS8, SignJWT } from "jose";
import { DEVELOPMENT_SHEET_ID, PRODUCTION_SHEET_ID } from "./local-dev-env.mjs";

const {
  ALLOW_DEV_WRITES,
  APP_ENV,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SHEET_ID,
} = process.env;

if (APP_ENV !== "development" || ALLOW_DEV_WRITES !== "true") {
  throw new Error("การทดสอบเขียนต้องเปิดอย่างตั้งใจด้วย APP_ENV=development และ ALLOW_DEV_WRITES=true");
}
if (GOOGLE_SHEET_ID === PRODUCTION_SHEET_ID || GOOGLE_SHEET_ID !== DEVELOPMENT_SHEET_ID) {
  throw new Error("หยุดเพื่อความปลอดภัย: การทดสอบเขียนอนุญาตเฉพาะชีต Development");
}
if (!GOOGLE_PRIVATE_KEY || !GOOGLE_SERVICE_ACCOUNT_EMAIL) throw new Error("ข้อมูลบัญชีระบบไม่ครบ");

const privateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
const key = await importPKCS8(privateKey, "RS256");
const issuedAt = Math.floor(Date.now() / 1000);
const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
  .setProtectedHeader({ alg: "RS256", typ: "JWT" })
  .setIssuer(GOOGLE_SERVICE_ACCOUNT_EMAIL)
  .setAudience("https://oauth2.googleapis.com/token")
  .setIssuedAt(issuedAt)
  .setExpirationTime(issuedAt + 3600)
  .sign(key);
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
});

const tokenResult = await tokenResponse.json().catch(() => null);
if (!tokenResponse.ok || !tokenResult?.access_token) throw new Error("ยืนยันบัญชีระบบ Google ไม่สำเร็จ");

const range = "ตั้งค่าร้าน!C100:D100";
const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}`;
const headers = { Authorization: `Bearer ${tokenResult.access_token}`, "Content-Type": "application/json" };
const originalResponse = await fetch(baseUrl, { headers });
const original = await originalResponse.json().catch(() => ({}));
if (!originalResponse.ok) throw new Error("อ่านพื้นที่ทดสอบเขียนไม่สำเร็จ");

const marker = `local-write-check-${crypto.randomUUID()}`;
let writeCompleted = false;
try {
  const writeResponse = await fetch(`${baseUrl}?valueInputOption=RAW`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[marker, new Date().toISOString()]] }),
  });
  if (!writeResponse.ok) throw new Error("เขียนพื้นที่ทดสอบไม่สำเร็จ");
  writeCompleted = true;

  const verifyResponse = await fetch(baseUrl, { headers });
  const verified = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok || verified?.values?.[0]?.[0] !== marker) throw new Error("ตรวจผลการเขียนไม่สำเร็จ");
} finally {
  if (writeCompleted) {
    if (Array.isArray(original.values) && original.values.length > 0) {
      await fetch(`${baseUrl}?valueInputOption=RAW`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ range, majorDimension: "ROWS", values: original.values }),
      });
    } else {
      await fetch(`${baseUrl}:clear`, { method: "POST", headers, body: "{}" });
    }
  }
}

console.log("ทดสอบเขียนและล้างข้อมูลในชีต Development สำเร็จ");
