import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DEVELOPMENT_SHEET_ID,
  LOCAL_ENV_PATH,
  SERVICE_ACCOUNT_PATH,
  readEnvFile,
  serializeEnvFile,
} from "./local-dev-env.mjs";

await mkdir(new URL("./", SERVICE_ACCOUNT_PATH), { recursive: true });

let serviceAccount;
try {
  serviceAccount = JSON.parse(await readFile(SERVICE_ACCOUNT_PATH, "utf8"));
} catch {
  throw new Error("ไม่พบไฟล์บัญชีระบบที่ตำแหน่งปลอดภัย กรุณาติดต่อผู้ดูแลโปรเจกต์");
}

if (
  serviceAccount.type !== "service_account" ||
  typeof serviceAccount.client_email !== "string" ||
  typeof serviceAccount.private_key !== "string"
) {
  throw new Error("ไฟล์บัญชีระบบ Google ไม่ถูกต้อง");
}

const existing = {
  ...(await readEnvFile(new URL("../.env", import.meta.url))),
  ...(await readEnvFile(new URL("../.env.local", import.meta.url))),
  ...(await readEnvFile(LOCAL_ENV_PATH)),
};

const localValues = {
  ...existing,
  ALLOW_DEV_WRITES: "false",
  APP_ENV: "development",
  GOOGLE_PRIVATE_KEY: serviceAccount.private_key,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: serviceAccount.client_email,
  GOOGLE_SHEET_ID: DEVELOPMENT_SHEET_ID,
  SENTRY_ENVIRONMENT: "development",
  SENTRY_RELEASE: "local",
  SLIPOK_ENABLED: "false",
};

await writeFile(LOCAL_ENV_PATH, serializeEnvFile(localValues), { mode: 0o600 });
await chmod(LOCAL_ENV_PATH, 0o600);
await chmod(SERVICE_ACCOUNT_PATH, 0o600);

console.log("ตั้งค่า local สำเร็จ");
console.log(`- Google Sheet: Development (${DEVELOPMENT_SHEET_ID})`);
console.log("- การเขียนข้อมูล: ปิดไว้เป็นค่าเริ่มต้น");
console.log("- SlipOK: ปิดใน local");
