import { writeFile } from "node:fs/promises";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output path is required");

const allowed = [
  "ADMIN_AUTH_SECRET",
  "ADMIN_PASSWORD_HASH",
  "ADMIN_PASSWORD_FALLBACK_ENABLED",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SHEET_ID",
  "SLIPOK_ENABLED",
  "SLIPOK_BRANCH_ID",
  "SLIPOK_API_KEY",
  "SENTRY_DSN",
];
const secrets = Object.fromEntries(
  allowed.flatMap((name) => process.env[name]?.trim() ? [[name, process.env[name]]] : []),
);

for (const required of ["ADMIN_AUTH_SECRET", "ADMIN_PASSWORD_HASH", "GOOGLE_PRIVATE_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEET_ID"]) {
  if (!secrets[required]) throw new Error(`${required} is required`);
}

await writeFile(outputPath, `${JSON.stringify(secrets)}\n`, { mode: 0o600 });
console.log(`Prepared ${Object.keys(secrets).length} approved Cloudflare secrets.`);
