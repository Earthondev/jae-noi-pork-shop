/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { reportOperationalError, type MonitoringBindings } from "../lib/monitoring";
import { PERMISSIONS_POLICY } from "../lib/security-policy";

interface Env extends MonitoringBindings {
  ASSETS?: Fetcher;
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  PRODUCT_MEDIA?: R2Bucket;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    // vinext streams React Server Component bootstrap data through inline
    // scripts. It does not expose a per-request nonce hook yet, so inline
    // scripts must remain allowed until nonce support is available.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Slip previews and downloadable receipt composition use short-lived
    // in-browser Blob URLs. Keep blob: scoped to images only.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": PERMISSIONS_POLICY,
} as const;

function isLocalDevelopmentHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function secureResponse(response: Response, isHttps: boolean, isLocalDevelopment = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (isLocalDevelopment && name === "Content-Security-Policy") continue;
    headers.set(name, value);
  }
  if (isHttps) headers.set("Strict-Transport-Security", "max-age=31536000");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

// R2-backed reads for /media/products/* and /media/brand/*, shared by the
// direct same-origin route below and by the image optimizer's fetchAsset —
// the optimizer's own ASSETS binding only serves prebuilt static files, so
// it can't reach these dynamically-served R2 objects on its own.
async function fetchProductMedia(pathname: string, env: Env): Promise<Response> {
  const key = pathname.slice("/media/".length);
  if (!key || key.includes("..") || key.startsWith("/")) return new Response(null, { status: 400 });
  if (!env.PRODUCT_MEDIA) return new Response(null, { status: 503 });
  const object = await env.PRODUCT_MEDIA.get(key);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol === "http:" && !isLocalDevelopmentHost(url.hostname)) {
      url.protocol = "https:";
      return secureResponse(Response.redirect(url, 308), false);
    }

    try {
      let response: Response;
      if (url.pathname.startsWith("/media/products/") || url.pathname.startsWith("/media/brand/")) {
        const key = url.pathname.slice("/media/".length);
        if (!key || key.includes("..") || key.startsWith("/")) {
          response = new Response(null, { status: 400 });
        } else if (!env.PRODUCT_MEDIA) {
          response = new Response(null, { status: 503 });
        } else {
          const object = await env.PRODUCT_MEDIA.get(key, { onlyIf: request.headers });
          if (!object) {
            response = new Response(null, { status: 404 });
          } else {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set("etag", object.httpEtag);
            headers.set("cache-control", "public, max-age=31536000, immutable");
            if (!("body" in object)) response = new Response(null, { status: 304, headers });
            else response = new Response(object.body, { headers });
          }
        }
      } else if (url.pathname === "/_vinext/image") {
        const assets = env.ASSETS;
        const images = env.IMAGES;
        if (!assets || !images) {
          const source = url.searchParams.get("url");
          if (!source || !source.startsWith("/") || source.startsWith("//")) {
            response = new Response(null, { status: 400 });
          } else {
            response = Response.redirect(new URL(source, request.url), 307);
          }
        } else {
          const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
          response = await handleImageOptimization(request, {
            fetchAsset: (path) => {
              const assetUrl = new URL(path, request.url);
              if (assetUrl.pathname.startsWith("/media/products/") || assetUrl.pathname.startsWith("/media/brand/")) {
                return fetchProductMedia(assetUrl.pathname, env);
              }
              return assets.fetch(new Request(assetUrl));
            },
            transformImage: async (body, { width, format, quality }) => {
              const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
              return result.response();
            },
          }, allowedWidths);
        }
      } else {
        response = await handler.fetch(request, env, ctx);
      }
      return secureResponse(response, url.protocol === "https:", isLocalDevelopmentHost(url.hostname));
    } catch (error) {
      ctx.waitUntil(reportOperationalError({
        event: "worker_unhandled_exception",
        operation: "worker.fetch",
        error,
        path: url.pathname,
        method: request.method,
        level: "fatal",
      }, env));
      if (url.pathname.startsWith("/api/")) {
        return secureResponse(Response.json(
          { code: "SYSTEM_UNAVAILABLE", error: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        ), url.protocol === "https:", isLocalDevelopmentHost(url.hostname));
      }
      return secureResponse(new Response(systemUnavailableHtml(), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      }), url.protocol === "https:", isLocalDevelopmentHost(url.hostname));
    }
  },
};

function systemUnavailableHtml(): string {
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ระบบขัดข้องชั่วคราว</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:#faf9f6;color:#2a1816;font-family:system-ui,sans-serif}.card{max-width:480px;padding:28px;border:1px solid #ebd6c8;border-radius:24px;background:#fff;text-align:center}h1{color:#7a1f1f}a{min-height:48px;padding:0 18px;display:inline-flex;align-items:center;border-radius:12px;background:#9c2a2a;color:#fff;text-decoration:none;font-weight:700}</style><main class="card"><h1>ขออภัย ระบบสะดุดชั่วคราว</h1><p>กรุณารอสักครู่แล้วลองใหม่อีกครั้ง</p><a href="/">กลับหน้าร้าน</a></main></html>`;
}

export default worker;
