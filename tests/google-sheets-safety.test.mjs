import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTION_GOOGLE_SHEET_ID,
  assertGoogleSheetsCredentialsConfigured,
  assertGoogleSheetsWriteAllowed,
  assertStorefrontSheetStructure,
  GoogleSheetsConfigurationError,
  GoogleSheetsWriteDisabledError,
} from "../lib/google-sheets-safety.ts";

const developmentBindings = {
  APP_ENV: "development",
  ALLOW_DEV_WRITES: "false",
  GOOGLE_SHEET_ID: "development-sheet-id",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "shop@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----",
};

const validRanges = [
  [["รหัสสินค้า", "ชื่อสินค้า", "หน่วยขาย", "รายละเอียด", "ราคา (บาท)", "สถานะขาย", "ชื่อไฟล์รูป", "แก้ไขล่าสุด", "URL รูปสินค้า"]],
  [["รหัสรอบ", "วันจัดส่ง", "เปิดรับตั้งแต่", "ปิดรับวันที่", "สถานะ", "ชื่อที่ลูกค้าเห็น", "หมายเหตุ", "จำนวนออเดอร์", "ยอดขาย", "การแสดงผล"]],
  [
    ["คีย์ตั้งค่า", "ค่า", "ใช้สำหรับ", "สถานะ"],
    ["store_name", "เจ๊น้อย เขียงหมูตะคร้อ", "ชื่อร้าน", "พร้อมใช้"],
    ["promptpay_id", "0000000000", "พร้อมเพย์", "พร้อมใช้"],
  ],
];

test("requires complete Google credentials instead of silently returning empty data", () => {
  assert.throws(
    () => assertGoogleSheetsCredentialsConfigured({ GOOGLE_SHEET_ID: "sheet" }),
    GoogleSheetsConfigurationError,
  );
  assert.doesNotThrow(() => assertGoogleSheetsCredentialsConfigured(developmentBindings));
});

test("blocks local writes by default and never permits development writes to production", () => {
  assert.throws(() => assertGoogleSheetsWriteAllowed(developmentBindings), GoogleSheetsWriteDisabledError);
  assert.doesNotThrow(() => assertGoogleSheetsWriteAllowed({
    ...developmentBindings,
    ALLOW_DEV_WRITES: "true",
  }));
  assert.throws(() => assertGoogleSheetsWriteAllowed({
    ...developmentBindings,
    ALLOW_DEV_WRITES: "true",
    GOOGLE_SHEET_ID: PRODUCTION_GOOGLE_SHEET_ID,
  }), GoogleSheetsWriteDisabledError);
  assert.doesNotThrow(() => assertGoogleSheetsWriteAllowed({
    ...developmentBindings,
    APP_ENV: "production",
    GOOGLE_SHEET_ID: PRODUCTION_GOOGLE_SHEET_ID,
  }));
});

test("accepts empty catalogs only when the storefront sheet structure is intact", () => {
  assert.doesNotThrow(() => assertStorefrontSheetStructure(validRanges));
  assert.throws(
    () => assertStorefrontSheetStructure([[], [], []]),
    GoogleSheetsConfigurationError,
  );
  assert.throws(
    () => assertStorefrontSheetStructure([
      validRanges[0],
      validRanges[1],
      [["คีย์ตั้งค่า", "ค่า", "ใช้สำหรับ", "สถานะ"]],
    ]),
    GoogleSheetsConfigurationError,
  );
});
