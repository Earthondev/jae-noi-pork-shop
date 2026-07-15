import { chmod, writeFile } from "node:fs/promises";
import {
  LOCAL_ENV_PATH,
  readEnvFile,
  serializeEnvFile,
} from "./local-dev-env.mjs";

const existing = {
  ...(await readEnvFile(new URL("../.env", import.meta.url))),
  ...(await readEnvFile(new URL("../.env.local", import.meta.url))),
  ...(await readEnvFile(LOCAL_ENV_PATH)),
};

const localValues = {
  ...existing,
  ALLOW_DEV_WRITES: "false",
  APP_ENV: "development",
  SENTRY_ENVIRONMENT: "development",
  SENTRY_RELEASE: "local",
  SLIPOK_ENABLED: "false",
};

delete localValues.GOOGLE_PRIVATE_KEY;
delete localValues.GOOGLE_SERVICE_ACCOUNT_EMAIL;
delete localValues.GOOGLE_SHEET_ID;

await writeFile(LOCAL_ENV_PATH, serializeEnvFile(localValues), { mode: 0o600 });
await chmod(LOCAL_ENV_PATH, 0o600);

console.log("ตั้งค่า local สำเร็จ");
console.log("- การเขียนข้อมูล: ปิดไว้เป็นค่าเริ่มต้น");
console.log("- SlipOK: ปิดใน local");
