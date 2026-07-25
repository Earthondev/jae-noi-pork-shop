import { createServer } from "node:net";
import {
  LOCAL_ENV_PATH,
  readEnvFile,
  requireNonEmpty,
} from "./local-dev-env.mjs";
import {
  LOCAL_REMOTE_D1_DATABASE_ID,
  LOCAL_REMOTE_D1_DATABASE_NAME,
  LOCAL_REMOTE_D1_MODE,
  isRemoteStagingD1Enabled,
} from "./local-remote-d1.mjs";

const values = await readEnvFile(LOCAL_ENV_PATH);
requireNonEmpty(values, [
  "APP_ENV",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_AUTH_SECRET",
]);

if (values.APP_ENV !== "development") throw new Error("APP_ENV ของ local ต้องเป็น development");
if (values.ALLOW_DEV_WRITES !== "false" && values.ALLOW_DEV_WRITES !== "true") {
  throw new Error("ALLOW_DEV_WRITES ต้องเป็น true หรือ false");
}

const localD1Mode = process.env.LOCAL_D1_MODE;
if (localD1Mode && localD1Mode !== LOCAL_REMOTE_D1_MODE) {
  throw new Error(`LOCAL_D1_MODE ต้องเป็น ${LOCAL_REMOTE_D1_MODE} หรือเว้นว่าง`);
}
if (isRemoteStagingD1Enabled() && values.ALLOW_DEV_WRITES !== "true") {
  throw new Error("Remote staging D1 ต้องตั้ง ALLOW_DEV_WRITES=true เพื่อทดสอบการเขียนข้อมูลจริง");
}

if (!process.argv.includes("--skip-port")) await assertPortAvailable(3000);

console.log("Local development พร้อมใช้งาน (D1 Mode)");
console.log(`- การเขียนข้อมูล: ${values.ALLOW_DEV_WRITES === "true" ? "เปิด" : "ปิด (ปลอดภัย)"}`);
if (isRemoteStagingD1Enabled()) {
  console.log(`- ฐานข้อมูล: Cloudflare D1 staging (${LOCAL_REMOTE_D1_DATABASE_NAME}, ${LOCAL_REMOTE_D1_DATABASE_ID})`);
} else {
  console.log("- ฐานข้อมูล: local Miniflare (ไม่เชื่อม Cloudflare)");
}

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
