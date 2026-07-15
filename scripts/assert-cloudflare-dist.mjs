import { readFile } from "node:fs/promises";

const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configPath, "utf8"));
const expected = new Map([
  ["UPLOADS", process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "jae-noi-pork-shop-uploads"],
  ["PRODUCT_MEDIA", process.env.CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME ?? "jae-noi-pork-shop-media"],
]);
const bindings = new Map(
  (Array.isArray(config.r2_buckets) ? config.r2_buckets : [])
    .map((binding) => [binding.binding, binding.bucket_name]),
);
const expectedD1Name = process.env.CLOUDFLARE_D1_DATABASE_NAME;
const expectedD1Id = process.env.CLOUDFLARE_D1_DATABASE_ID;
const d1 = (Array.isArray(config.d1_databases) ? config.d1_databases : [])
  .find((binding) => binding.binding === "DB");

if (!expectedD1Name || !expectedD1Id || d1?.database_name !== expectedD1Name || d1?.database_id !== expectedD1Id) {
  console.error("Refusing deployment: DB must point to the explicitly configured D1 database.");
  process.exitCode = 1;
}
if (config.name !== process.env.CLOUDFLARE_WORKER_NAME) {
  console.error("Refusing deployment: Worker name does not match CLOUDFLARE_WORKER_NAME.");
  process.exitCode = 1;
}

for (const [binding, bucketName] of expected) {
  if (!bucketName || bindings.get(binding) !== bucketName) {
    console.error(
      `Refusing deployment: ${binding} must target ${bucketName || "a configured production bucket"}. Re-run npm run deploy:cloudflare with the production environment values.`,
    );
    process.exitCode = 1;
  }
}
