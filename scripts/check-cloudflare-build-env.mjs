const requiredValues = [
  "CLOUDFLARE_WORKER_NAME",
  "CLOUDFLARE_D1_DATABASE_NAME",
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_R2_BUCKET_NAME",
  "CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME",
];

const missing = requiredValues.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(
    `Cloudflare build is missing: ${missing.join(", ")}. See docs/cloudflare-client-handoff.md.`,
  );
  process.exitCode = 1;
} else {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(process.env.CLOUDFLARE_WORKER_NAME)) {
    console.error("CLOUDFLARE_WORKER_NAME must be a lowercase Cloudflare Worker name.");
    process.exitCode = 1;
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(process.env.CLOUDFLARE_D1_DATABASE_NAME)) {
    console.error("CLOUDFLARE_D1_DATABASE_NAME is invalid.");
    process.exitCode = 1;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.CLOUDFLARE_D1_DATABASE_ID)) {
    console.error("CLOUDFLARE_D1_DATABASE_ID must be a real D1 UUID, not a placeholder.");
    process.exitCode = 1;
  }
  const domain = process.env.CLOUDFLARE_CUSTOM_DOMAIN?.trim();
  if (domain && (
    domain.includes("://") ||
    domain.includes("/") ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      domain,
    )
  )) {
    console.error(
      "CLOUDFLARE_CUSTOM_DOMAIN must be a hostname such as shop.example.com, without https:// or a path.",
    );
    process.exitCode = 1;
  }
}
