/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { reportOperationalError, type MonitoringBindings } from "../lib/monitoring";

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

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {

    if (url.pathname.startsWith("/media/products/")) {
      const key = url.pathname.slice("/media/".length);
      if (!key || key.includes("..") || key.startsWith("/")) return new Response(null, { status: 400 });
      if (!env.PRODUCT_MEDIA) return new Response(null, { status: 503 });

      const object = await env.PRODUCT_MEDIA.get(key, { onlyIf: request.headers });
      if (!object) return new Response(null, { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("x-content-type-options", "nosniff");
      if (!("body" in object)) return new Response(null, { status: 304, headers });
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/_vinext/image") {
      const assets = env.ASSETS;
      const images = env.IMAGES;
      if (!assets || !images) {
        const source = url.searchParams.get("url");
        if (!source || !source.startsWith("/") || source.startsWith("//")) {
          return new Response(null, { status: 400 });
        }
        return Response.redirect(new URL(source, request.url), 307);
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
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
        return Response.json(
          { code: "SYSTEM_UNAVAILABLE", error: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง" },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        );
      }
      return new Response(systemUnavailableHtml(), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  },
};

function systemUnavailableHtml(): string {
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ระบบขัดข้องชั่วคราว</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:#faf9f6;color:#2a1816;font-family:system-ui,sans-serif}.card{max-width:480px;padding:28px;border:1px solid #ebd6c8;border-radius:24px;background:#fff;text-align:center}h1{color:#7a1f1f}a{min-height:48px;padding:0 18px;display:inline-flex;align-items:center;border-radius:12px;background:#9c2a2a;color:#fff;text-decoration:none;font-weight:700}</style><main class="card"><h1>ขออภัย ระบบสะดุดชั่วคราว</h1><p>กรุณารอสักครู่แล้วลองใหม่อีกครั้ง</p><a href="/">กลับหน้าร้าน</a></main></html>`;
}

export default worker;
