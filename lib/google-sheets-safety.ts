export const PRODUCTION_GOOGLE_SHEET_ID = "10kwcEYyyOA3tIKTpmdwH21KIdpidLaiU04RC6ON6tJE";

export type GoogleSheetsSafetyBindings = {
  APP_ENV?: string;
  ALLOW_DEV_WRITES?: string;
  GOOGLE_SHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
};

export class GoogleSheetsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsConfigurationError";
  }
}

export class GoogleSheetsWriteDisabledError extends Error {
  constructor() {
    super("Google Sheets writes are disabled for this environment");
    this.name = "GoogleSheetsWriteDisabledError";
  }
}

export function assertGoogleSheetsCredentialsConfigured(bindings: GoogleSheetsSafetyBindings): void {
  const email = bindings.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = bindings.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const sheetId = bindings.GOOGLE_SHEET_ID?.trim();

  if (!sheetId || !email || !privateKey) {
    throw new GoogleSheetsConfigurationError("Google Sheets credentials are incomplete");
  }
  if (!email.endsWith(".iam.gserviceaccount.com")) {
    throw new GoogleSheetsConfigurationError("Google service account email is invalid");
  }
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new GoogleSheetsConfigurationError("Google service account private key is invalid");
  }
}

export function assertGoogleSheetsWriteAllowed(bindings: GoogleSheetsSafetyBindings): void {
  const appEnvironment = bindings.APP_ENV?.trim().toLowerCase();
  const sheetId = bindings.GOOGLE_SHEET_ID?.trim();

  if (appEnvironment === "production") return;
  if (
    appEnvironment === "development" &&
    bindings.ALLOW_DEV_WRITES?.trim().toLowerCase() === "true" &&
    sheetId &&
    sheetId !== PRODUCTION_GOOGLE_SHEET_ID
  ) {
    return;
  }
  throw new GoogleSheetsWriteDisabledError();
}

type SheetScalar = string | number | boolean;

const EXPECTED_STOREFRONT_HEADERS: ReadonlyArray<ReadonlyArray<string>> = [
  ["รหัสสินค้า", "ชื่อสินค้า", "หน่วยขาย", "รายละเอียด", "ราคา (บาท)", "สถานะขาย", "ชื่อไฟล์รูป", "แก้ไขล่าสุด", "URL รูปสินค้า"],
  ["รหัสรอบ", "วันจัดส่ง", "เปิดรับตั้งแต่", "ปิดรับวันที่", "สถานะ", "ชื่อที่ลูกค้าเห็น", "หมายเหตุ", "จำนวนออเดอร์", "ยอดขาย", "การแสดงผล"],
  ["คีย์ตั้งค่า", "ค่า", "ใช้สำหรับ", "สถานะ"],
];

export function assertStorefrontSheetStructure(ranges: SheetScalar[][][]): void {
  if (ranges.length !== EXPECTED_STOREFRONT_HEADERS.length) {
    throw new GoogleSheetsConfigurationError("Google Sheets storefront ranges are incomplete");
  }

  for (let index = 0; index < EXPECTED_STOREFRONT_HEADERS.length; index += 1) {
    const expectedHeader = EXPECTED_STOREFRONT_HEADERS[index];
    const actualHeader = ranges[index]?.[0] ?? [];
    const isValid = expectedHeader.every((expected, column) => String(actualHeader[column] ?? "").trim() === expected);
    if (!isValid) {
      throw new GoogleSheetsConfigurationError(`Google Sheets storefront header ${index + 1} is invalid`);
    }
  }

  const settingsRows = ranges[2]?.slice(1) ?? [];
  const settingKeys = new Set(settingsRows.map((row) => String(row[0] ?? "").trim()).filter(Boolean));
  for (const requiredKey of ["store_name", "promptpay_id"]) {
    if (!settingKeys.has(requiredKey)) {
      throw new GoogleSheetsConfigurationError(`Google Sheets setting ${requiredKey} is missing`);
    }
  }
}
