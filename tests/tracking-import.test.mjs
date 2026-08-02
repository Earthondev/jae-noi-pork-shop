import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  MAX_TRACKING_IMPORT_BYTES,
  TrackingImportValidationError,
  evaluateTrackingMatch,
  parseTrackingWorkbook,
} from "../lib/tracking-import.ts";
import { carrierLabel, carrierTrackingUrl, isCarrierCode } from "../lib/carriers.ts";

function flashWorkbook(rows) {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Pickup Date", "Order no", "Tracking number", "Consignee ", "Phone number", "Address", "Item type", "Weight（kg)", "Demensions", "COD Amount(THB)", "COD fee", "Happy Return", "Flash Care", "Declared value", "Freight", "Packaging fee", "On-Time Delivery", "Total charge(THB)"],
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "sheet");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xls" }));
}

test("parses Flash XLS rows and ignores the Total footer", async () => {
  const bytes = flashWorkbook([
    ["2026-07-25 10:00", "JN-20260725-23456789AB", "TH1234567890", "คุณ สมชาย", "081-234-5678", "1 ถนนตัวอย่าง กรุงเทพฯ 10110", "Daily Necessities", 1, "10*10*10", 0, 0, 0, 0, 0, 50, 0, 0, 50],
    ["2026-07-25 10:01", "", "TH0987654321", "คุณ สมหญิง", 891234567, "2 ถนนตัวอย่าง กรุงเทพฯ 10110", "Daily Necessities", 1, "10*10*10", 0, 0, 0, 0, 0, 50, 0, 0, 50],
    ["Total", "", "", "", "", "", "", "", "", 0, 0, 0, 0, 0, 100, 0, 0, 100],
  ]);

  const parsed = await parseTrackingWorkbook({
    name: "Pickuplist-2026-07-25.xls",
    contentType: "application/vnd.ms-excel",
    bytes,
  }, "flash");

  assert.equal(parsed.carrierCode, "flash");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.ignoredRows, 1);
  assert.equal(parsed.rows[0].sourceRow, 2);
  assert.equal(parsed.rows[0].orderReference, "JN-20260725-23456789AB");
  assert.equal(parsed.rows[0].trackingNumber, "TH1234567890");
  assert.equal(parsed.rows[0].phoneNormalized, "0812345678");
  assert.equal(parsed.rows[1].phoneNormalized, "0891234567");
  assert.match(parsed.fileHash, /^[a-f0-9]{64}$/);
});

test("rejects files with the wrong magic bytes or oversized uploads", async () => {
  await assert.rejects(
    parseTrackingWorkbook({ name: "fake.xls", contentType: "application/vnd.ms-excel", bytes: new TextEncoder().encode("not an excel file") }, "flash"),
    (error) => error instanceof TrackingImportValidationError && /ชนิดไฟล์/.test(error.message),
  );
  await assert.rejects(
    parseTrackingWorkbook({ name: "large.csv", contentType: "text/csv", bytes: new Uint8Array(MAX_TRACKING_IMPORT_BYTES + 1) }, "flash"),
    (error) => error instanceof TrackingImportValidationError && /2 MB/.test(error.message),
  );
});

test("rejects a workbook that does not match the Flash header contract", async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([["Name", "Parcel"], ["Example", "TH123"]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "sheet");
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  await assert.rejects(
    parseTrackingWorkbook({ name: "unknown.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes }, "flash"),
    (error) => error instanceof TrackingImportValidationError && /หัวตาราง Flash/.test(error.message),
  );
});

test("carrier metadata is allowlisted and produces an HTTPS tracking link", () => {
  assert.equal(isCarrierCode("flash"), true);
  assert.equal(isCarrierCode("javascript:alert(1)"), false);
  assert.equal(carrierLabel("flash"), "Flash Express");
  assert.equal(carrierTrackingUrl("flash", "TH 12/34"), "https://www.flashexpress.com/tracking/?se=TH1234");
});

test("matches only one paid postal order and leaves duplicate phones for admin review", () => {
  const source = {
    sourceRow: 2,
    pickupDate: "2026-07-25",
    orderReference: "",
    trackingNumber: "TH1234567890",
    consignee: "สมชาย",
    phoneNormalized: "0812345678",
    address: "กรุงเทพฯ",
  };
  const eligible = (id) => ({
    id,
    customer_name: "สมชาย",
    phone: "0812345678",
    fulfilment: "postal",
    payment_status: "paid",
    order_status: "preparing",
    tracking_number: null,
    carrier_code: null,
    delivery_date: "2026-07-25",
    created_at: "2026-07-20T00:00:00.000Z",
  });

  const matched = evaluateTrackingMatch(source, [eligible("JN-20260725-23456789AB")], "flash");
  assert.equal(matched.status, "matched");
  assert.equal(matched.suggestedOrderId, "JN-20260725-23456789AB");

  const ambiguous = evaluateTrackingMatch(source, [eligible("JN-20260725-23456789AB"), eligible("JN-20260725-BCDEFGHJKM")], "flash");
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.suggestedOrderId, null);
  assert.equal(ambiguous.candidates.length, 2);
});

test("does not overwrite an existing different tracking number", () => {
  const result = evaluateTrackingMatch({
    sourceRow: 3,
    pickupDate: "2026-07-25",
    orderReference: "JN-20260725-23456789AB",
    trackingNumber: "TH1234567890",
    consignee: "สมชาย",
    phoneNormalized: "0812345678",
    address: "กรุงเทพฯ",
  }, [{
    id: "JN-20260725-23456789AB",
    customer_name: "สมชาย",
    phone: "0812345678",
    fulfilment: "postal",
    payment_status: "paid",
    order_status: "shipped",
    tracking_number: "TH9999999999",
    carrier_code: "flash",
    delivery_date: "2026-07-25",
    created_at: "2026-07-20T00:00:00.000Z",
  }], "flash");
  assert.equal(result.status, "conflict");
  assert.equal(result.suggestedOrderId, null);
});

test("admin import endpoint keeps uploads authenticated, bounded, same-origin, and private", async () => {
  const route = await readFile(new URL("../app/api/admin/tracking-imports/route.ts", import.meta.url), "utf8");
  assert.match(route, /await getAdminUser\(\)/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(route, /parseBoundedFormData\(request, MAX_REQUEST_BYTES\)/);
  assert.match(route, /checkRateLimit\(/);
  assert.match(route, /"Cache-Control": "no-store, private"/);
});

test("database migration guards audit rows against a stale preview", async () => {
  const migration = await readFile(new URL("../migrations/0006_tracking_imports.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TRIGGER tracking_import_rows_order_guard/);
  assert.match(migration, /payment_status = 'paid'/);
  assert.match(migration, /tracking_number = NEW\.tracking_number/);
  assert.match(migration, /RAISE\(ABORT, 'tracking import order state changed'\)/);
});

test("customer tracking view provides a copy action and allowlisted carrier link", async () => {
  const view = await readFile(new URL("../app/track/order-tracker.tsx", import.meta.url), "utf8");
  assert.match(view, /navigator\.clipboard\.writeText/);
  assert.match(view, /rel="noopener noreferrer"/);
  assert.match(view, /order\.trackingUrl/);
});
