import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import {
  LOCAL_REMOTE_D1_DATABASE_ID,
  LOCAL_REMOTE_D1_DATABASE_NAME,
  isRemoteStagingD1Enabled,
} from "./scripts/local-remote-d1.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const DEFAULT_PRODUCT_MEDIA_ORIGIN =
  "https://pub-152b30e9e62f4e82aa0893fd90576e96.r2.dev";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

/**
 * Hostnames to publish for a configured custom domain. An apex gets its www
 * form as well, because customers type it and a bare apex leaves them on a
 * dead hostname. A domain that already names a subdomain is published alone —
 * "www.shop.example.com" is not something anyone asked for.
 */
export function customDomainPatterns(customDomain: string): string[] {
  const host = customDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return [];
  if (host.startsWith("www.")) return [host, host.slice(4)];
  return host.split(".").length > 2 ? [host] : [host, `www.${host}`];
}

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const isLocalDevelopment = command === "serve";
  const useRemoteStagingD1 = isLocalDevelopment && isRemoteStagingD1Enabled();
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
        ADMIN_ALLOWED_EMAILS: process.env.ADMIN_ALLOWED_EMAILS ?? "",
        ALLOW_DEV_WRITES: process.env.ALLOW_DEV_WRITES ?? "false",
        APP_ENV: process.env.APP_ENV ?? "development",
        CLOUDFLARE_ACCESS_AUD: process.env.CLOUDFLARE_ACCESS_AUD ?? "",
        CLOUDFLARE_ACCESS_TEAM_DOMAIN:
          process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? "",
        PRODUCT_MEDIA_ORIGIN: productMediaOrigin,
        SLIPOK_ENABLED: process.env.SLIPOK_ENABLED ?? "false",
        SLIPOK_BRANCH_ID: process.env.SLIPOK_BRANCH_ID ?? "",
        SLIPOK_API_KEY: process.env.SLIPOK_API_KEY ?? "",
        SENTRY_DSN: process.env.SENTRY_DSN ?? "",
        SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "development",
        SENTRY_RELEASE: process.env.SENTRY_RELEASE ?? "local",
      }
    : isCloudflareDeployment
      ? {
          ADMIN_USERNAME: "admin",
          APP_ENV: "production",
          PRODUCT_MEDIA_ORIGIN: productMediaOrigin,
          SENTRY_ENVIRONMENT: "production",
          SENTRY_RELEASE:
            process.env.CF_PAGES_COMMIT_SHA ??
            process.env.GITHUB_SHA ??
            "production",
        }
      : {};

  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: isCloudflareDeployment ? !customDomain : undefined,
    preview_urls: isCloudflareDeployment ? !customDomain : undefined,
    // `wrangler deploy` reconciles routes against this list, so a hostname that
    // is not here gets detached on the next deploy — adding www through the
    // dashboard silently disappeared until it was declared here. An apex is
    // therefore always published together with its www form; the canonical tag
    // in app/layout.tsx keeps search engines on one of them.
    routes:
      isCloudflareDeployment && customDomain
        ? customDomainPatterns(customDomain).map((pattern) => ({ pattern, custom_domain: true }))
        : [],
    // Production credentials must be configured with `wrangler secret put`.
    // They are intentionally omitted from build output so private keys and API
    // keys cannot be committed or displayed in build artifacts.
    vars: runtimeVars,
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: useRemoteStagingD1
              ? LOCAL_REMOTE_D1_DATABASE_NAME
              : "site-creator-d1",
            database_id: useRemoteStagingD1
              ? LOCAL_REMOTE_D1_DATABASE_ID
              : SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
            remote: useRemoteStagingD1,
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
    // A single binding handles both storefront optimization and security
    // normalization of uploaded product/slip images.
    images: { binding: "IMAGES" },
    // Static assets are served whether or not this is named, but `env.ASSETS`
    // only exists inside the Worker when it is. `/_vinext/image` checks for it
    // and falls back to a 307 at the untouched source file when it is missing —
    // which is why every product photo was being delivered full-size and
    // unconverted even though the optimizer was wired up correctly.
    assets: { binding: "ASSETS" },
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
