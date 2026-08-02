import { writeFile } from "node:fs/promises";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output path is required");

// The admin password and its session secret were removed on 2026-08-03; the
// admin panel is authenticated by Cloudflare Access, whose settings are these
// three identity values rather than a credential of our own.
const allowed = [
  "ADMIN_ALLOWED_EMAILS",
  "CLOUDFLARE_ACCESS_AUD",
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "SLIPOK_ENABLED",
  "SLIPOK_BRANCH_ID",
  "SLIPOK_API_KEY",
  "SENTRY_DSN",
];
const secrets = Object.fromEntries(
  allowed.flatMap((name) => process.env[name]?.trim() ? [[name, process.env[name]]] : []),
);

// Without all three, authenticateCloudflareAccess admits nobody and the admin
// panel is unreachable — better to fail here than after deploying.
for (const required of ["ADMIN_ALLOWED_EMAILS", "CLOUDFLARE_ACCESS_AUD", "CLOUDFLARE_ACCESS_TEAM_DOMAIN"]) {
  if (!secrets[required]) throw new Error(`${required} is required`);
}

await writeFile(outputPath, `${JSON.stringify(secrets)}\n`, { mode: 0o600 });
console.log(`Prepared ${Object.keys(secrets).length} approved Cloudflare secrets.`);
