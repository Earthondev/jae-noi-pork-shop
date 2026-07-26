import assert from "node:assert/strict";
import test from "node:test";
import {
  RECENT_ORDER_STORAGE_KEY,
  RECENT_ORDER_TTL_MS,
  clearRecentOrder,
  readRecentOrder,
  saveRecentOrder,
} from "../lib/recent-order.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const ORDER_ID = "JN-20260726-7G4K2P9ABC";

test("stores only the latest order id and timestamps for 30 days", () => {
  const storage = new MemoryStorage();
  const now = Date.UTC(2026, 6, 26);
  assert.equal(saveRecentOrder(storage, ORDER_ID, now), true);
  const raw = storage.getItem(RECENT_ORDER_STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw, /name|phone|address|slip|items|payment/i);
  assert.deepEqual(readRecentOrder(storage, now + 1), { orderId: ORDER_ID, savedAt: now });
  assert.equal(readRecentOrder(storage, now + RECENT_ORDER_TTL_MS + 1), null);
  assert.equal(storage.getItem(RECENT_ORDER_STORAGE_KEY), null);
});

test("rejects malformed ids and corrupted storage", () => {
  const storage = new MemoryStorage();
  assert.equal(saveRecentOrder(storage, "ORDER-123"), false);
  storage.setItem(RECENT_ORDER_STORAGE_KEY, "{broken");
  assert.equal(readRecentOrder(storage), null);
});

test("clears a remembered order without affecting other storage", () => {
  const storage = new MemoryStorage();
  storage.setItem("unrelated", "keep");
  saveRecentOrder(storage, ORDER_ID, 100);
  assert.equal(clearRecentOrder(storage), true);
  assert.equal(readRecentOrder(storage, 101), null);
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("fails closed when browser storage is unavailable", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(saveRecentOrder(blocked, ORDER_ID), false);
  assert.equal(readRecentOrder(blocked), null);
  assert.equal(clearRecentOrder(blocked), false);
});
