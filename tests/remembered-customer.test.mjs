import assert from "node:assert/strict";
import test from "node:test";
import {
  REMEMBERED_CUSTOMER_TTL_MS,
  REMEMBERED_CUSTOMERS_STORAGE_KEY,
  forgetRememberedCustomer,
  readRememberedCustomer,
  saveRememberedCustomer,
} from "../lib/remembered-customer.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("remembers only customer contact details for 180 days", () => {
  const storage = new MemoryStorage();
  const now = Date.UTC(2026, 6, 15);
  assert.equal(saveRememberedCustomer(storage, { customerName: "ลูกค้าทดสอบ", phone: "093-168-7892", address: "โคราช" }, now), true);
  const raw = storage.getItem(REMEMBERED_CUSTOMERS_STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw, /slip|note|items|payment/i);
  assert.equal(readRememberedCustomer(storage, "0931687892", now + 1)?.address, "โคราช");
  assert.equal(readRememberedCustomer(storage, "0931687892", now + REMEMBERED_CUSTOMER_TTL_MS + 1), null);
});

test("keeps the latest address when the same phone orders again", () => {
  const storage = new MemoryStorage();
  assert.equal(saveRememberedCustomer(storage, { customerName: "คุณเอ", phone: "0812345678", address: "ที่อยู่เดิม" }, 100), true);
  assert.equal(saveRememberedCustomer(storage, { customerName: "คุณเอ", phone: "0812345678", address: "ที่อยู่ล่าสุด" }, 200), true);
  assert.equal(readRememberedCustomer(storage, "0812345678", 201)?.address, "ที่อยู่ล่าสุด");
  assert.equal(JSON.parse(storage.getItem(REMEMBERED_CUSTOMERS_STORAGE_KEY)).customers.length, 1);
});

test("separates phone numbers and lets the customer forget one profile", () => {
  const storage = new MemoryStorage();
  saveRememberedCustomer(storage, { customerName: "คุณเอ", phone: "0812345678", address: "A" }, 100);
  saveRememberedCustomer(storage, { customerName: "คุณบี", phone: "0898765432", address: "B" }, 200);
  assert.equal(readRememberedCustomer(storage, "0812345678", 201)?.customerName, "คุณเอ");
  assert.equal(forgetRememberedCustomer(storage, "0812345678", 201), true);
  assert.equal(readRememberedCustomer(storage, "0812345678", 201), null);
  assert.equal(readRememberedCustomer(storage, "0898765432", 201)?.customerName, "คุณบี");
});

test("fails closed when storage is unavailable or the phone is invalid", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(saveRememberedCustomer(blocked, { customerName: "คุณเอ", phone: "0812345678", address: "A" }), false);
  assert.equal(readRememberedCustomer(blocked, "0812345678"), null);
  assert.equal(saveRememberedCustomer(new MemoryStorage(), { customerName: "คุณเอ", phone: "123", address: "A" }), false);
});
