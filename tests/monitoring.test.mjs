import assert from "node:assert/strict";
import test from "node:test";
import {
  MONITORING_DAILY_LIMIT,
  reportOperationalError,
  resetMonitoringMemoryForTests,
  stripSensitiveErrorDetails,
} from "../lib/monitoring.ts";
import { PUBLIC_ERROR_MESSAGES, safeClientApiMessage } from "../lib/public-errors.ts";

class MemoryR2Object {
  constructor(value, etag) { this.value = value; this.etag = etag; }
  async json() { return JSON.parse(this.value); }
}

class MemoryR2 {
  objects = new Map();
  version = 0;
  async get(key) {
    const object = this.objects.get(key);
    return object ? new MemoryR2Object(object.value, object.etag) : null;
  }
  async put(key, value, options = {}) {
    const existing = this.objects.get(key);
    const onlyIf = options.onlyIf;
    if (onlyIf?.etagDoesNotMatch === "*" && existing) return null;
    if (onlyIf?.etagMatches && existing?.etag !== onlyIf.etagMatches) return null;
    if (onlyIf?.etagMatches && !existing) return null;
    const etag = `etag-${++this.version}`;
    this.objects.set(key, { value: String(value), etag });
    return { key, etag };
  }
}

function sentryBindings(bucket) {
  return {
    UPLOADS: bucket,
    SENTRY_DSN: "https://public-key@example.ingest.sentry.io/123456",
    SENTRY_ENVIRONMENT: "test",
    SENTRY_RELEASE: "test-release",
  };
}

test("Sentry envelope excludes raw messages and customer data", async () => {
  resetMonitoringMemoryForTests();
  const bucket = new MemoryR2();
  const requests = [];
  const secretText = "ลูกค้า สมชาย 0812345678 บ้านเลขที่ 99 earthlikemwbb@gmail.com";
  const error = new Error(secretText);
  error.stack = `Error: ${secretText}\n    at checkout (/Users/earthondev/project/order.ts:12:3)`;
  const result = await reportOperationalError({
    event: "order_write_failed",
    operation: "order.append_sheet",
    error,
    path: "/api/orders?phone=0812345678",
    method: "POST",
  }, sentryBindings(bucket), {
    now: () => new Date("2026-07-15T10:00:00.000Z"),
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(result.status, "sent");
  assert.equal(requests.length, 1);
  const envelope = String(requests[0].init.body);
  assert.doesNotMatch(envelope, /สมชาย|0812345678|earthlikemwbb|บ้านเลขที่ 99/);
  assert.doesNotMatch(envelope, /\/Users\/earthondev/);
  assert.match(envelope, /order_write_failed/);
});

test("one repeated failure is sent only once per 15-minute window", async () => {
  resetMonitoringMemoryForTests();
  const bucket = new MemoryR2();
  let deliveries = 0;
  const options = {
    now: () => new Date("2026-07-15T10:00:00.000Z"),
    fetch: async () => { deliveries += 1; return new Response(null, { status: 200 }); },
  };
  for (let index = 0; index < 1_000; index += 1) {
    await reportOperationalError({
      event: "storefront_unavailable",
      operation: "storefront.load",
      error: new TypeError(`private-${index}`),
    }, sentryBindings(bucket), options);
  }
  assert.equal(deliveries, 1);
});

test("daily cap allows at most 100 events plus one cap notice", async () => {
  resetMonitoringMemoryForTests();
  const bucket = new MemoryR2();
  let deliveries = 0;
  const options = {
    now: () => new Date("2026-07-15T10:00:00.000Z"),
    fetch: async () => { deliveries += 1; return new Response(null, { status: 200 }); },
  };
  for (let index = 0; index < 300; index += 1) {
    await reportOperationalError({
      event: "worker_unhandled_exception",
      operation: `worker.unique_${index}`,
      error: new Error("must not be sent"),
    }, sentryBindings(bucket), options);
  }
  assert.equal(deliveries, MONITORING_DAILY_LIMIT + 1);
});

test("public error helpers never pass a server message to the browser", () => {
  assert.equal(
    safeClientApiMessage(500, { error: "Google private key malformed" }, "STORE_UNAVAILABLE"),
    PUBLIC_ERROR_MESSAGES.STORE_UNAVAILABLE,
  );
  assert.equal(
    safeClientApiMessage(409, { error: "สินค้านี้ปิดรับชั่วคราว" }, "ORDER_UNAVAILABLE"),
    "สินค้านี้ปิดรับชั่วคราว",
  );
  const details = stripSensitiveErrorDetails(new Error("private message"));
  assert.equal(details.errorType, "Error");
  assert.ok(details.stackFrames.every((line) => !line.includes("private message")));
});
