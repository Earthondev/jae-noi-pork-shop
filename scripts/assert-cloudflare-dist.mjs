import { readFile } from "node:fs/promises";

const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(configPath, "utf8"));
const expected = new Map([
  ["UPLOADS", process.env.CLOUDFLARE_R2_BUCKET_NAME],
  ["PRODUCT_MEDIA", process.env.CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME],
]);
const bindings = new Map(
  (Array.isArray(config.r2_buckets) ? config.r2_buckets : [])
    .map((binding) => [binding.binding, binding.bucket_name]),
);

for (const [binding, bucketName] of expected) {
  if (!bucketName || bindings.get(binding) !== bucketName) {
    console.error(
      `Refusing deployment: ${binding} must target ${bucketName || "a configured production bucket"}. Re-run npm run deploy:cloudflare with the production environment values.`,
    );
    process.exitCode = 1;
  }
}
