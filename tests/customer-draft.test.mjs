import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_DRAFT_STORAGE_KEY,
  CHECKOUT_DRAFT_TTL_MS,
  clearCheckoutDraft,
  readCheckoutDraft,
  reconcileDraftQuantities,
  writeCheckoutDraft,
} from "../lib/customer-draft.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const draft = {
  quantities: { NAEM250: 2, SAUSAGE10: 1 },
  customerName: "ลูกค้าทดสอบ",
  phone: "081-234-5678",
  address: "ที่อยู่ทดสอบ",
  addressLine: "บ้านเลขที่ 1",
  subdistrict: "ในเมือง",
  district: "เมืองนครราชสีมา",
  province: "นครราชสีมา",
  postalCode: "30000",
  note: "โทรก่อนส่ง",
  fulfilment: "postal",
  selectedRound: "RD-20260719",
};

test("stores only product ids and quantities, restores them, and expires after 24 hours", () => {
  const storage = new MemoryStorage();
  const now = Date.UTC(2026, 6, 14);
  assert.equal(writeCheckoutDraft(storage, draft, now), true);
  const raw = storage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw, /price|unitPrice/);
  assert.deepEqual(JSON.parse(raw).quantities, { NAEM250: 2, SAUSAGE10: 1 });
  assert.deepEqual(readCheckoutDraft(storage, now + 1_000), draft);
  assert.equal(readCheckoutDraft(storage, now + CHECKOUT_DRAFT_TTL_MS + 1), null);
  assert.equal(storage.getItem(CHECKOUT_DRAFT_STORAGE_KEY), null);
});

test("keeps quantities against fresh products without storing or restoring prices", () => {
  const result = reconcileDraftQuantities({ NAEM250: 2 }, [
    { id: "NAEM250", name: "แหนมหมู", price: 65, status: "เปิดขาย" },
  ]);
  assert.deepEqual(result, { quantities: { NAEM250: 2 }, unavailableNames: [] });
});

test("silently removes a product deleted from the sheet but names a temporarily closed product", () => {
  assert.deepEqual(
    reconcileDraftQuantities({ DELETED: 1 }, []),
    { quantities: {}, unavailableNames: [] },
  );
  assert.deepEqual(
    reconcileDraftQuantities({ CLOSED: 1 }, [{ id: "CLOSED", name: "สินค้าปิดชั่วคราว", price: 50, status: "ปิดชั่วคราว" }]),
    { quantities: {}, unavailableNames: ["สินค้าปิดชั่วคราว"] },
  );
});

test("falls back without throwing when localStorage is blocked or corrupt", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(readCheckoutDraft(blocked), null);
  assert.equal(writeCheckoutDraft(blocked, draft), false);
  assert.equal(clearCheckoutDraft(blocked), false);

  const corrupt = new MemoryStorage();
  corrupt.setItem(CHECKOUT_DRAFT_STORAGE_KEY, "not-json");
  assert.equal(readCheckoutDraft(corrupt), null);
});
