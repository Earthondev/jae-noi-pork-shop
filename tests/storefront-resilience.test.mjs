import assert from "node:assert/strict";
import test from "node:test";
import {
  STOREFRONT_SNAPSHOT_KEY,
  loadResilientStorefront,
} from "../lib/storefront-resilience.ts";

class MemoryR2 {
  objects = new Map();
  failWrites = false;

  async get(key) {
    const value = this.objects.get(key);
    if (value === undefined) return null;
    return { json: async () => JSON.parse(value) };
  }

  async put(key, value) {
    if (this.failWrites) throw new Error("R2 unavailable");
    this.objects.set(key, String(value));
    return { key };
  }
}

const freshData = {
  products: [{ id: "NAEM250", price: 50 }],
  rounds: [{ id: "RD-20260716" }],
  content: { storeName: "เจ๊น้อย เขียงหมูตะคร้อ" },
};

function isStorefrontData(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray(value.products) &&
      Array.isArray(value.rounds) &&
      value.content &&
      typeof value.content === "object",
  );
}

test("retries one transient Google failure and stores the successful snapshot", async () => {
  const bucket = new MemoryR2();
  let calls = 0;

  const result = await loadResilientStorefront({
    bucket,
    validate: isStorefrontData,
    loadFresh: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary Google 500");
      return freshData;
    },
    shouldRetry: () => true,
    maxAttempts: 2,
    retryDelayMs: 0,
    timeoutMs: 50,
    now: () => new Date("2026-07-15T09:00:00.000Z"),
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "google-sheets");
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.data, freshData);
  assert.ok(bucket.objects.has(STOREFRONT_SNAPSHOT_KEY));
});

test("returns the last-known-good R2 snapshot after bounded timeouts", async () => {
  const bucket = new MemoryR2();
  await bucket.put(STOREFRONT_SNAPSHOT_KEY, JSON.stringify({
    version: 1,
    savedAt: "2026-07-15T08:30:00.000Z",
    data: freshData,
  }));
  let calls = 0;

  const result = await loadResilientStorefront({
    bucket,
    validate: isStorefrontData,
    loadFresh: async () => {
      calls += 1;
      return new Promise(() => undefined);
    },
    shouldRetry: () => true,
    maxAttempts: 2,
    retryDelayMs: 0,
    timeoutMs: 5,
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "r2-stale");
  assert.equal(result.savedAt, "2026-07-15T08:30:00.000Z");
  assert.deepEqual(result.data, freshData);
});

test("does not retry a permanent Google configuration error", async () => {
  const bucket = new MemoryR2();
  await bucket.put(STOREFRONT_SNAPSHOT_KEY, JSON.stringify({
    version: 1,
    savedAt: "2026-07-15T08:30:00.000Z",
    data: freshData,
  }));
  let calls = 0;

  const result = await loadResilientStorefront({
    bucket,
    validate: isStorefrontData,
    loadFresh: async () => {
      calls += 1;
      throw new Error("Google 403");
    },
    shouldRetry: () => false,
    maxAttempts: 2,
    retryDelayMs: 0,
    timeoutMs: 50,
  });

  assert.equal(calls, 1);
  assert.equal(result.source, "r2-stale");
  assert.equal(result.attempts, 1);
});

test("fresh storefront data remains available if writing its R2 snapshot fails", async () => {
  const bucket = new MemoryR2();
  bucket.failWrites = true;

  const result = await loadResilientStorefront({
    bucket,
    validate: isStorefrontData,
    loadFresh: async () => freshData,
    shouldRetry: () => true,
    maxAttempts: 2,
    retryDelayMs: 0,
    timeoutMs: 50,
  });

  assert.equal(result.source, "google-sheets");
  assert.deepEqual(result.data, freshData);
});

test("never saves malformed fresh data over the last-known-good snapshot", async () => {
  const bucket = new MemoryR2();
  await bucket.put(STOREFRONT_SNAPSHOT_KEY, JSON.stringify({
    version: 1,
    savedAt: "2026-07-15T08:30:00.000Z",
    data: freshData,
  }));

  const result = await loadResilientStorefront({
    bucket,
    validate: isStorefrontData,
    loadFresh: async () => ({ products: [], rounds: [] }),
    shouldRetry: () => false,
    maxAttempts: 2,
    retryDelayMs: 0,
    timeoutMs: 50,
  });

  assert.equal(result.source, "r2-stale");
  assert.deepEqual(result.data, freshData);
  const stored = JSON.parse(bucket.objects.get(STOREFRONT_SNAPSHOT_KEY));
  assert.deepEqual(stored.data, freshData);
});
