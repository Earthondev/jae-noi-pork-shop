import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ImageNormalizationError,
  normalizeUploadedImage,
} from "../lib/image-normalization.ts";
import { PERMISSIONS_POLICY } from "../lib/security-policy.ts";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("worker centrally enforces HTTPS and security headers", async () => {
  const worker = await projectFile("worker/index.ts");
  assert.match(worker, /url\.protocol === "http:"/);
  assert.match(worker, /Response\.redirect\(url, 308\)/);
  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /Strict-Transport-Security/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /Permissions-Policy/);
  assert.match(worker, /secureResponse\(response/);
});

test("browser permission policy denies unnecessary hardware and location access", () => {
  for (const capability of [
    "camera",
    "microphone",
    "geolocation",
    "display-capture",
    "bluetooth",
    "midi",
    "serial",
    "usb",
    "xr-spatial-tracking",
  ]) {
    assert.match(PERMISSIONS_POLICY, new RegExp(`${capability.replaceAll("-", "\\-")}=\\(\\)`));
  }
  assert.doesNotMatch(PERMISSIONS_POLICY, /clipboard-write|web-share/);
});

test("CSP permits local slip previews without allowing blob scripts or frames", async () => {
  const [worker, nextConfig] = await Promise.all([
    projectFile("worker/index.ts"),
    projectFile("next.config.ts"),
  ]);
  for (const policySource of [worker, nextConfig]) {
    assert.match(policySource, /img-src 'self' data: blob:/);
    assert.doesNotMatch(policySource, /script-src[^"\n]*blob:/);
    assert.doesNotMatch(policySource, /frame-src[^"\n]*blob:/);
  }
});

test("public order route rate limits and bounds the body before multipart parsing", async () => {
  const route = await projectFile("app/api/orders/route.ts");
  assert.match(route, /ORDER_IP_MAX_PER_WINDOW = 6/);
  assert.match(route, /ORDER_PHONE_MAX_PER_WINDOW = 3/);
  assert.match(route, /parseBoundedFormData/);
  assert.ok(route.indexOf("if (!(await checkRateLimit") < route.indexOf("parseBoundedFormData(request"));
});

test("round-interest taps are rate limited before being recorded, and the table holds no PII", async () => {
  const [route, migration] = await Promise.all([
    projectFile("app/api/round-interest/route.ts"),
    projectFile("migrations/0008_round_interest.sql"),
  ]);
  assert.ok(route.indexOf("await checkRateLimit(") < route.indexOf("await recordRoundInterestTap("));
  assert.match(migration, /CREATE TABLE IF NOT EXISTS round_interest \(\s*id INTEGER PRIMARY KEY AUTOINCREMENT,\s*created_at TEXT NOT NULL\s*\);/);
});

test("uploaded images are decoded and re-encoded before storage", async () => {
  const [orders, productImages, normalizer] = await Promise.all([
    projectFile("app/api/orders/route.ts"),
    projectFile("app/api/admin/product-image/route.ts"),
    projectFile("lib/image-normalization.ts"),
  ]);
  assert.match(orders, /normalizeUploadedImage/);
  assert.match(productImages, /normalizeUploadedImage/);
  assert.match(normalizer, /\.transform\(/);
  assert.match(normalizer, /\.output\(/);
  assert.match(normalizer, /scale-down/);
});

test("image normalization fails closed and returns only transformed bytes", async () => {
  await assert.rejects(
    normalizeUploadedImage(new Uint8Array([1, 2, 3]), undefined, { purpose: "product", maxOutputBytes: 100 }),
    ImageNormalizationError,
  );

  const output = new Uint8Array([9, 8, 7]);
  let transformOptions;
  const images = {
    input() {
      return {
        transform(options) {
          transformOptions = options;
          return {
            async output() {
              return { response: () => new Response(output, { status: 200 }) };
            },
          };
        },
      };
    },
  };
  const normalized = await normalizeUploadedImage(
    new Uint8Array([1, 2, 3]),
    images,
    { purpose: "product", maxOutputBytes: 100 },
  );
  assert.deepEqual(normalized.bytes, output);
  assert.equal(normalized.contentType, "image/webp");
  assert.equal(transformOptions.fit, "scale-down");
});
