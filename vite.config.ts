import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const DEFAULT_PRODUCT_MEDIA_ORIGIN =
  "https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const isLocalDevelopment = command === "serve";
  const isCloudflareDeployment =
    command === "build" && process.env.DEPLOY_TARGET === "cloudflare";
  const customDomain = process.env.CLOUDFLARE_CUSTOM_DOMAIN?.trim();
  const cloudflareBucketName =
    process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim() ||
    "jae-noi-pork-shop-uploads";
  const cloudflareProductMediaBucketName =
    process.env.CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME?.trim() ||
    "jae-noi-pork-shop-media";
  const productMediaOrigin =
    process.env.PRODUCT_MEDIA_ORIGIN?.trim() || DEFAULT_PRODUCT_MEDIA_ORIGIN;
  const runtimeVars: Record<string, string> = isLocalDevelopment
    ? {
        ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? "admin",
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH ?? "",
        ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET ?? "",
        GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID ?? "",
        GOOGLE_SERVICE_ACCOUNT_EMAIL:
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ?? "",
        PRODUCT_MEDIA_ORIGIN: productMediaOrigin,
        SLIPOK_ENABLED: process.env.SLIPOK_ENABLED ?? "false",
        SLIPOK_BRANCH_ID: process.env.SLIPOK_BRANCH_ID ?? "",
        SLIPOK_API_KEY: process.env.SLIPOK_API_KEY ?? "",
      }
    : isCloudflareDeployment
      ? {
          ADMIN_USERNAME: "admin",
          PRODUCT_MEDIA_ORIGIN: productMediaOrigin,
        }
      : {};

  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: isCloudflareDeployment ? !customDomain : undefined,
    preview_urls: isCloudflareDeployment ? !customDomain : undefined,
    routes:
      isCloudflareDeployment && customDomain
        ? [{ pattern: customDomain, custom_domain: true }]
        : [],
    // Production credentials must be configured with `wrangler secret put`.
    // They are intentionally omitted from build output so private keys and API
    // keys cannot be committed or displayed in build artifacts.
    vars: runtimeVars,
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: [
      ...(r2
        ? [
            {
              binding: r2,
              bucket_name: isCloudflareDeployment
                ? cloudflareBucketName
                : "site-creator-r2",
            },
          ]
        : []),
      {
        binding: "PRODUCT_MEDIA",
        bucket_name: cloudflareProductMediaBucketName,
        remote: isLocalDevelopment,
      },
    ],
  };

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
