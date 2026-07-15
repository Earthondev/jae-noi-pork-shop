import { createServer } from "node:net";
import {
  LOCAL_ENV_PATH,
  readEnvFile,
  requireNonEmpty,
} from "./local-dev-env.mjs";

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

if (!process.argv.includes("--skip-port")) await assertPortAvailable(3000);

console.log("Local development พร้อมใช้งาน (D1 Mode)");
console.log(`- การเขียนข้อมูล: ${values.ALLOW_DEV_WRITES === "true" ? "เปิด" : "ปิด (ปลอดภัย)"}`);

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
