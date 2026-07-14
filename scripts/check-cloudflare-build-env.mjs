const requiredValues = [
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
