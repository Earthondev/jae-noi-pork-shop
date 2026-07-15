import { createServer } from "node:net";
import { importPKCS8, SignJWT } from "jose";
import {
  DEVELOPMENT_SHEET_ID,
  LOCAL_ENV_PATH,
  PRODUCTION_SHEET_ID,
  readEnvFile,
  requireNonEmpty,
} from "./local-dev-env.mjs";

const values = await readEnvFile(LOCAL_ENV_PATH);
requireNonEmpty(values, [
  "APP_ENV",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
]);

if (values.APP_ENV !== "development") throw new Error("APP_ENV ของ local ต้องเป็น development");
if (values.GOOGLE_SHEET_ID === PRODUCTION_SHEET_ID) throw new Error("หยุดเพื่อความปลอดภัย: local กำลังชี้ไปชีต Production");
if (values.GOOGLE_SHEET_ID !== DEVELOPMENT_SHEET_ID) throw new Error("local ต้องใช้ชีต Development ที่กำหนดไว้เท่านั้น");
if (values.ALLOW_DEV_WRITES !== "false" && values.ALLOW_DEV_WRITES !== "true") {
  throw new Error("ALLOW_DEV_WRITES ต้องเป็น true หรือ false");
}

const privateKey = values.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) throw new Error("รูปแบบ private key ไม่ถูกต้อง");
if (!values.GOOGLE_SERVICE_ACCOUNT_EMAIL.endsWith(".iam.gserviceaccount.com")) {
  throw new Error("รูปแบบ service account email ไม่ถูกต้อง");
}

if (!process.argv.includes("--skip-port")) await assertPortAvailable(3000);

const signingKey = await importPKCS8(privateKey, "RS256");
const issuedAt = Math.floor(Date.now() / 1000);
const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
  .setProtectedHeader({ alg: "RS256", typ: "JWT" })
  .setIssuer(values.GOOGLE_SERVICE_ACCOUNT_EMAIL)
  .setAudience("https://oauth2.googleapis.com/token")
  .setIssuedAt(issuedAt)
  .setExpirationTime(issuedAt + 3600)
  .sign(signingKey);

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});
const tokenResult = await tokenResponse.json().catch(() => null);
if (!tokenResponse.ok || !tokenResult?.access_token) throw new Error("ยืนยันบัญชีระบบ Google ไม่สำเร็จ");

const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
for (const range of ["สินค้า!A:I", "รอบจัดส่ง!A:J", "ตั้งค่าร้าน!A:D"]) query.append("ranges", range);
const sheetResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${values.GOOGLE_SHEET_ID}/values:batchGet?${query}`,
  { headers: { Authorization: `Bearer ${tokenResult.access_token}` } },
);
const sheetResult = await sheetResponse.json().catch(() => null);
if (!sheetResponse.ok) throw new Error("บัญชีระบบอ่านชีต Development ไม่สำเร็จ");

const expectedHeaders = ["รหัสสินค้า", "รหัสรอบ", "คีย์ตั้งค่า"];
const ranges = sheetResult?.valueRanges ?? [];
if (ranges.length !== expectedHeaders.length) throw new Error("โครงสร้างชีต Development ไม่ครบ");
for (let index = 0; index < expectedHeaders.length; index += 1) {
  if (ranges[index]?.values?.[0]?.[0] !== expectedHeaders[index]) {
    throw new Error(`หัวตารางชีต Development ไม่ถูกต้อง (${index + 1})`);
  }
}

console.log("Local development พร้อมใช้งาน");
console.log(`- สินค้า: ${Math.max(0, (ranges[0]?.values?.length ?? 1) - 1)} รายการ`);
console.log(`- รอบจัดส่ง: ${Math.max(0, (ranges[1]?.values?.length ?? 1) - 1)} รอบ`);
console.log(`- ค่าร้าน: ${Math.max(0, (ranges[2]?.values?.length ?? 1) - 1)} ค่า`);
console.log(`- การเขียนข้อมูล: ${values.ALLOW_DEV_WRITES === "true" ? "เปิดเฉพาะชีต Development" : "ปิด (ปลอดภัย)"}`);

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`พอร์ต ${port} ถูกใช้งานอยู่ กรุณาปิด local server เดิมก่อน`));
      } else {
        reject(error);
      }
    });
    server.listen(port, () => server.close(resolve));
  });
}
