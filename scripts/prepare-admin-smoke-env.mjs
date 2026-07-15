import { writeFile } from "node:fs/promises";
import { createAdminPasswordHash } from "../lib/admin-auth.ts";

const outputPath = process.argv[2];
const password = process.env.ADMIN_SMOKE_PASSWORD;
if (!outputPath || !password) throw new Error("Output path and ADMIN_SMOKE_PASSWORD are required");

const passwordHash = await createDotenvSafePasswordHash(password);

const values = {
  ADMIN_AUTH_SECRET: required("ADMIN_AUTH_SECRET"),
  ADMIN_PASSWORD_HASH: passwordHash,
  ADMIN_PASSWORD_FALLBACK_ENABLED: "true",
  GOOGLE_PRIVATE_KEY: required("GOOGLE_PRIVATE_KEY"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  GOOGLE_SHEET_ID: required("GOOGLE_SHEET_ID"),
  SLIPOK_ENABLED: "false",
};
const body = Object.entries(values)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  .join("\n");
await writeFile(outputPath, `${body}\n`, { mode: 0o600 });
console.log("Prepared isolated staging admin smoke-test environment.");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function createDotenvSafePasswordHash(value) {
  for (;;) {
    const hash = await createAdminPasswordHash(value);
    const [, , salt, derived] = hash.split("$");
    if (/^\d/.test(salt) && /^\d/.test(derived)) return hash;
  }
}
