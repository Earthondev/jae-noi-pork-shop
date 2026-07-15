import { env } from "cloudflare:workers";
import type { AdminOrder, OrderStatus, PaymentStatus } from "../db/orders";
import { maskPhone, matchesPhone, matchesPhoneLast4, type PublicOrderTracking } from "./order-tracking";
import {
  catalogProductsFromRows,
  DEFAULT_STORE_COVER,
  DEFAULT_STORE_LOGO,
  safeProductImageUrl,
  safeStorefrontAssetUrl,
  PRODUCT_IMAGE_PLACEHOLDER,
  type CatalogProduct,
} from "./product-catalog";
import { normalizeProductStatus } from "./product-catalog";
import { safePickupMapUrl } from "./storefront-settings";
import {
  assertGoogleSheetsCredentialsConfigured,
  assertGoogleSheetsWriteAllowed,
  assertStorefrontSheetStructure,
  GoogleSheetsConfigurationError,
  type GoogleSheetsSafetyBindings,
} from "./google-sheets-safety";
import {
  cleanStorefrontSettings,
  dateInputFromSheetsSerial,
  dateTimeInputFromSheetsSerial,
  DEFAULT_STOREFRONT_CONTENT,
  fingerprint,
  roundIdFromDeliveryDate,
  sheetsSerialFromInput,
  validateProductInput,
  validateRoundInput,
  type AdminCmsData,
  type AdminProduct,
  type AdminRound,
  type AdminStorefrontSettings,
  type ProductInput,
  type RoundInput,
} from "./admin-cms";

type GoogleBindings = GoogleSheetsSafetyBindings & {
  PRODUCT_MEDIA_ORIGIN?: string;
};

function googleBindings(): GoogleBindings {
  return env as unknown as GoogleBindings;
}

function spreadsheetId(): string {
  const id = googleBindings().GOOGLE_SHEET_ID?.trim();
  if (!id) throw new GoogleSheetsConfigurationError("Google Sheet ID is missing");
  return id;
}
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type AccessToken = { value: string; expiresAt: number };
type SheetScalar = string | number | boolean;
type SheetsValuesResponse = { values?: string[][] };
type SheetsBatchGetResponse = { valueRanges?: Array<{ values?: SheetScalar[][] }> };
type SheetPaymentStatus = "รอชำระเงิน" | "รอตรวจสลิป" | "ชำระแล้ว" | "สลิปไม่ถูกต้อง" | "คืนเงินแล้ว";
type SheetOrderStatus = "รับออเดอร์แล้ว" | "กำลังเตรียม" | "พร้อมรับหน้าร้าน" | "จัดส่งแล้ว" | "สำเร็จ" | "ยกเลิก";
type CellValue = { stringValue: string } | { numberValue: number } | { formulaValue: string };
type CellData = { userEnteredValue: CellValue };

const ORDER_SHEET_ID = 103;
const ORDER_ITEM_SHEET_ID = 104;
const ROUND_SHEET_ID = 101;
const PRODUCT_SHEET_ID = 102;

let cachedAccessToken: AccessToken | null = null;

export class GoogleSheetsUpstreamError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "GoogleSheetsUpstreamError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function shouldRetryGoogleSheetsError(error: unknown): boolean {
  if (error instanceof GoogleSheetsConfigurationError) return false;
  if (error instanceof GoogleSheetsUpstreamError) return error.retryable;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError;
}

export type StorefrontProduct = CatalogProduct;

export type StorefrontRound = {
  id: string;
  deliveryDate: string;
  opensAt: string;
  closesAt: string;
  label: string;
  note: string;
};

export type NewSheetOrder = {
  id: string;
  roundId: string;
  createdAt: string;
  customerName: string;
  phone: string;
  fulfilment: "pickup" | "postal";
  address: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  slipKey: string | null;
  paymentStatus: SheetPaymentStatus;
  orderStatus: SheetOrderStatus;
  adminNote: string;
  note: string;
  idempotencyKey: string;
  items: Array<{ id: string; name: string; unit: string; quantity: number; unitPrice: number }>;
};

const sheetPaymentStatusToApp: Record<string, PaymentStatus> = {
  "รอชำระเงิน": "waiting_for_payment",
  "รอตรวจสลิป": "waiting_for_slip_review",
  "ชำระแล้ว": "paid",
  "สลิปไม่ถูกต้อง": "invalid_slip",
  "คืนเงินแล้ว": "refunded",
};

const sheetOrderStatusToApp: Record<string, OrderStatus> = {
  "รับออเดอร์แล้ว": "received",
  "กำลังเตรียม": "preparing",
  "พร้อมรับหน้าร้าน": "ready_for_pickup",
  "จัดส่งแล้ว": "shipped",
  "สำเร็จ": "completed",
  "ยกเลิก": "cancelled",
};

const appStatusToSheet: Record<OrderStatus, string> = {
  received: "รับออเดอร์แล้ว",
  preparing: "กำลังเตรียม",
  ready_for_pickup: "พร้อมรับหน้าร้าน",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};

const appPaymentStatusToSheet: Record<PaymentStatus, string> = {
  waiting_for_payment: "รอชำระเงิน",
  waiting_for_slip_review: "รอตรวจสลิป",
  paid: "ชำระแล้ว",
  invalid_slip: "สลิปไม่ถูกต้อง",
  refunded: "คืนเงินแล้ว",
};

function serviceCredentials(): { email: string; privateKey: string } | null {
  const bindings = googleBindings();
  const email = bindings.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = bindings.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return email && privateKey ? { email, privateKey } : null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJson(value: object): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function getAccessToken(signal?: AbortSignal): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const credentials = serviceCredentials();
  if (!credentials) throw new GoogleSheetsConfigurationError("Google Sheets credentials are incomplete");

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: credentials.email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GoogleSheetsUpstreamError("เชื่อมต่อบัญชีระบบ Google ไม่สำเร็จ", null, true);
  }
  const result = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;
  if (!response.ok || !result?.access_token) {
    throw new GoogleSheetsUpstreamError(
      result?.error_description ?? "บัญชีระบบ Google ใช้งานไม่ได้",
      response.status,
      isRetryableGoogleStatus(response.status),
    );
  }
  cachedAccessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return result.access_token;
}

async function sheetsRequest(path: string, init?: RequestInit, signal?: AbortSignal): Promise<Response> {
  const bindings = googleBindings();
  assertGoogleSheetsCredentialsConfigured(bindings);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") assertGoogleSheetsWriteAllowed(bindings);
  const token = await getAccessToken(signal);
  let response: Response;
  try {
    response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
      signal: init?.signal ?? signal,
    });
  } catch (error) {
    if (signal?.aborted || init?.signal?.aborted) throw error;
    throw new GoogleSheetsUpstreamError("เชื่อมต่อ Google Sheets ไม่สำเร็จ", null, true);
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (response.status === 401) cachedAccessToken = null;
    throw new GoogleSheetsUpstreamError(
      result?.error?.message ?? "เชื่อมต่อ Google Sheets ไม่สำเร็จ",
      response.status,
      response.status === 401 || isRetryableGoogleStatus(response.status),
    );
  }
  return response;
}

async function readRanges(ranges: string[], signal?: AbortSignal): Promise<string[][][]> {
  const rows = await readRangesWithRenderOption(ranges, "FORMATTED_VALUE", signal);
  return rows.map((range) => range.map((row) => row.map((value) => String(value ?? ""))));
}

async function readRangesWithRenderOption(
  ranges: string[],
  valueRenderOption: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
  signal?: AbortSignal,
): Promise<SheetScalar[][][]> {
  assertGoogleSheetsCredentialsConfigured(googleBindings());
  const query = new URLSearchParams({ valueRenderOption, dateTimeRenderOption: "SERIAL_NUMBER" });
  for (const range of ranges) query.append("ranges", range);
  const response = await sheetsRequest(`/values:batchGet?${query.toString()}`, undefined, signal);
  const result = await response.json() as SheetsBatchGetResponse;
  return ranges.map((_, index) => result.valueRanges?.[index]?.values ?? []);
}

function numberValue(value: string | undefined): number {
  const parsed = Number((value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cell(value: string | number): CellData {
  return {
    userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value },
  };
}

function formulaCell(value: string): CellData {
  return { userEnteredValue: { formulaValue: value } };
}

function settingsFromRows(rows: string[][]): Record<string, { value: string; status: string }> {
  return Object.fromEntries(rows.slice(1).filter((row) => row[0]).map((row) => [row[0], {
    value: row[1] ?? "",
    status: row[3] ?? "รอข้อมูล",
  }]));
}

export async function getStorefrontData(options: { signal?: AbortSignal } = {}) {
  const storefrontRanges = await readRanges(
    ["สินค้า!A:J", "รอบจัดส่ง!A:J", "ตั้งค่าร้าน!A:D"],
    options.signal,
  );
  assertStorefrontSheetStructure(storefrontRanges);
  const [productRows, roundRows, settingRows] = storefrontRanges;
  const products: StorefrontProduct[] = catalogProductsFromRows(productRows, googleBindings().PRODUCT_MEDIA_ORIGIN);

  const allRoundRows = roundRows.slice(1).filter((row) => row[0]);
  const toStorefrontRound = (row: string[]): StorefrontRound => ({
    id: row[0],
    deliveryDate: row[1],
    opensAt: row[2],
    closesAt: row[3],
    label: row[5],
    note: row[6],
  });
  const rounds: StorefrontRound[] = allRoundRows
    .filter((row) => row[0] && row[4] === "เปิดรับ" && row[9] === "แสดงใน dropdown")
    .map(toStorefrontRound);
  const nextRoundRow = allRoundRows.find((row) =>
    ["เปิดรับ", "เตรียมเปิด"].includes(row[4]) && ["ยังไม่ถึงเวลาเปิด", "ยังไม่แสดง"].includes(row[9]),
  );

  const settings = settingsFromRows(settingRows);
  const shippingFee = settings.postal_shipping_fee?.value ? numberValue(settings.postal_shipping_fee.value) : null;
  const pickupAddress = settings.pickup_address?.status === "พร้อมใช้" && settings.pickup_address.value
    ? settings.pickup_address.value
    : null;
  const pickupMapUrl = settings.pickup_map_url?.status === "พร้อมใช้"
    ? safePickupMapUrl(settings.pickup_map_url.value)
    : null;

  return {
    products,
    rounds,
    nextRound: nextRoundRow ? toStorefrontRound(nextRoundRow) : null,
    shippingFee,
    pickupAddress,
    pickupMapUrl,
    promptPayId: settings.promptpay_id?.value || null,
    promptPayName: settings.promptpay_name?.value || null,
    content: {
      storeName: settings.store_name?.value || "เจ๊น้อย เขียงหมูตะคร้อ",
      heroTitle: settings.hero_title?.value || DEFAULT_STOREFRONT_CONTENT.heroTitle,
      heroHighlight: settings.hero_highlight?.value || DEFAULT_STOREFRONT_CONTENT.heroHighlight,
      heroDescription: settings.hero_description?.value || DEFAULT_STOREFRONT_CONTENT.heroDescription,
      announcementText: settings.announcement_text?.value || DEFAULT_STOREFRONT_CONTENT.announcementText,
      storyTitle: settings.story_title?.value || DEFAULT_STOREFRONT_CONTENT.storyTitle,
      storyDescription: settings.story_description?.value || DEFAULT_STOREFRONT_CONTENT.storyDescription,
      phonePrimary: settings.phone_primary?.value || "087-2416773",
      phoneSecondary: settings.phone_secondary?.value || "087-8755479",
      storeLogoUrl: safeStorefrontAssetUrl(settings.store_logo_url?.value, DEFAULT_STORE_LOGO, googleBindings().PRODUCT_MEDIA_ORIGIN),
      storeCoverUrl: safeStorefrontAssetUrl(settings.store_cover_url?.value, DEFAULT_STORE_COVER, googleBindings().PRODUCT_MEDIA_ORIGIN),
    },
    secureWriteReady: serviceCredentials() !== null,
  };
}

export type StorefrontData = Awaited<ReturnType<typeof getStorefrontData>>;

function isRetryableGoogleStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function getAdminCmsData(): Promise<AdminCmsData> {
  const [productRows, roundRows, settingRows] = await readRangesWithRenderOption(
    ["สินค้า!A:J", "รอบจัดส่ง!A:J", "ตั้งค่าร้าน!A:D"],
    "UNFORMATTED_VALUE",
  );
  const formattedRoundRows = (await readRanges(["รอบจัดส่ง!A:J"]))[0];

  const products: AdminProduct[] = await Promise.all(productRows.slice(1).filter((row) => row[0]).map(async (row) => {
    const source = row.slice(0, 10);
    return {
      id: String(row[0] ?? ""),
      name: String(row[1] ?? ""),
      unit: String(row[2] ?? ""),
      detail: String(row[3] ?? ""),
      price: row[4] === undefined || row[4] === "" ? null : numberValue(String(row[4])),
      status: normalizeProductStatus(String(row[5] ?? "")),
      updatedAt: String(row[7] ?? ""),
      imageUrl: String(row[8] ?? ""),
      category: String(row[9] ?? "") || "อื่น ๆ",
      fingerprint: await fingerprint(source),
    };
  }));

  const rounds: AdminRound[] = await Promise.all(roundRows.slice(1).filter((row) => row[0]).map(async (row, index) => {
    const formatted = formattedRoundRows[index + 1] ?? [];
    const source = row.slice(0, 10);
    return {
      id: String(row[0] ?? ""),
      deliveryDate: dateInputFromSheetsSerial(row[1]),
      opensAt: dateTimeInputFromSheetsSerial(row[2]),
      closesAt: dateTimeInputFromSheetsSerial(row[3]),
      status: String(row[4] ?? "เตรียมเปิด") as AdminRound["status"],
      label: formatted[5] ?? String(row[5] ?? ""),
      note: String(row[6] ?? ""),
      orderCount: numberValue(String(row[7] ?? "0")),
      sales: numberValue(String(row[8] ?? "0")),
      displayState: formatted[9] ?? String(row[9] ?? ""),
      fingerprint: await fingerprint(source),
    };
  }));

  const settingTextRows = settingRows.map((row) => row.map((value) => String(value ?? "")));
  const settingsByKey = settingsFromRows(settingTextRows);
  const settingsBase = {
    storeName: settingsByKey.store_name?.value || "เจ๊น้อย เขียงหมูตะคร้อ",
    heroTitle: settingsByKey.hero_title?.value || DEFAULT_STOREFRONT_CONTENT.heroTitle,
    heroHighlight: settingsByKey.hero_highlight?.value || DEFAULT_STOREFRONT_CONTENT.heroHighlight,
    heroDescription: settingsByKey.hero_description?.value || DEFAULT_STOREFRONT_CONTENT.heroDescription,
    announcementText: settingsByKey.announcement_text?.value || DEFAULT_STOREFRONT_CONTENT.announcementText,
    storyTitle: settingsByKey.story_title?.value || DEFAULT_STOREFRONT_CONTENT.storyTitle,
    storyDescription: settingsByKey.story_description?.value || DEFAULT_STOREFRONT_CONTENT.storyDescription,
    phonePrimary: settingsByKey.phone_primary?.value || "087-2416773",
    phoneSecondary: settingsByKey.phone_secondary?.value || "087-8755479",
    shippingFee: settingsByKey.postal_shipping_fee?.value ? numberValue(settingsByKey.postal_shipping_fee.value) : null,
    pickupAddress: settingsByKey.pickup_address?.value || "",
    pickupMapUrl: settingsByKey.pickup_map_url?.value || "",
    storeLogoUrl: settingsByKey.store_logo_url?.value || "",
    storeCoverUrl: settingsByKey.store_cover_url?.value || "",
  };
  const settings: AdminStorefrontSettings = {
    ...settingsBase,
    fingerprint: await fingerprint(settingRows.slice(1).filter((row) => row[0])),
  };

  return { products, rounds, settings, refreshedAt: new Date().toISOString() };
}

export type CmsMutationResult = "updated" | "not_found" | "conflict" | "duplicate";

export async function createAdminProduct(input: ProductInput): Promise<CmsMutationResult> {
  const product = validateProductInput(input);
  assertSafeProductImage(product.imageUrl);
  const rows = (await readRangesWithRenderOption(["สินค้า!A:J"], "UNFORMATTED_VALUE"))[0];
  if (rows.slice(1).some((row) => String(row[0] ?? "").toUpperCase() === product.id)) return "duplicate";
  const rowNumber = firstBlankRow(rows);
  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ updateCells: {
      start: { sheetId: PRODUCT_SHEET_ID, rowIndex: rowNumber - 1, columnIndex: 0 },
      rows: [{ values: [
        cell(product.id), cell(product.name), cell(product.unit), cell(product.detail),
        product.price === null ? cell("") : cell(product.price), cell(product.status), cell(""),
        cell(new Date().toISOString()), cell(product.imageUrl), cell(product.category),
      ] }],
      fields: "userEnteredValue",
    } }] }),
  });
  return "updated";
}

export async function updateAdminProduct(id: string, input: ProductInput): Promise<CmsMutationResult> {
  const product = validateProductInput({ ...input, id });
  assertSafeProductImage(product.imageUrl);
  const rows = (await readRangesWithRenderOption(["สินค้า!A:J"], "UNFORMATTED_VALUE"))[0];
  const index = rows.slice(1).findIndex((row) => String(row[0] ?? "") === id);
  if (index < 0) return "not_found";
  const currentRow = rows[index + 1] ?? [];
  if (input.fingerprint && await fingerprint(currentRow.slice(0, 10)) !== input.fingerprint) return "conflict";
  const rowNumber = index + 2;
  await writeRawValues([
    { range: `สินค้า!B${rowNumber}:F${rowNumber}`, values: [[product.name, product.unit, product.detail, product.price ?? "", product.status]] },
    { range: `สินค้า!H${rowNumber}:I${rowNumber}`, values: [[new Date().toISOString(), product.imageUrl]] },
    { range: `สินค้า!J${rowNumber}`, values: [[product.category]] },
  ]);
  return "updated";
}

export async function moveAdminProduct(id: string, direction: "up" | "down", expectedFingerprint?: string): Promise<CmsMutationResult> {
  const rows = (await readRangesWithRenderOption(["สินค้า!A:J"], "UNFORMATTED_VALUE"))[0];
  const index = rows.slice(1).findIndex((row) => String(row[0] ?? "") === id);
  if (index < 0) return "not_found";
  const rowIndex = index + 1;
  if (expectedFingerprint && await fingerprint((rows[rowIndex] ?? []).slice(0, 10)) !== expectedFingerprint) return "conflict";
  const targetIndex = direction === "up" ? rowIndex - 1 : rowIndex + 1;
  if (targetIndex < 1 || targetIndex >= rows.length || !rows[targetIndex]?.[0]) return "updated";
  const current = padRow(rows[rowIndex] ?? [], 10);
  const target = padRow(rows[targetIndex] ?? [], 10);
  await writeRawValues([
    { range: `สินค้า!A${rowIndex + 1}:J${rowIndex + 1}`, values: [target] },
    { range: `สินค้า!A${targetIndex + 1}:J${targetIndex + 1}`, values: [current] },
  ]);
  return "updated";
}

export async function createAdminRound(input: RoundInput): Promise<CmsMutationResult> {
  const round = validateRoundInput(input);
  const id = roundIdFromDeliveryDate(round.deliveryDate);
  const rows = (await readRangesWithRenderOption(["รอบจัดส่ง!A:J"], "UNFORMATTED_VALUE"))[0];
  if (rows.slice(1).some((row) => String(row[0] ?? "") === id)) return "duplicate";
  const rowNumber = firstBlankRow(rows);
  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ updateCells: {
      start: { sheetId: ROUND_SHEET_ID, rowIndex: rowNumber - 1, columnIndex: 0 },
      rows: [{ values: [
        cell(id), cell(sheetsSerialFromInput(round.deliveryDate)), cell(sheetsSerialFromInput(round.opensAt)),
        cell(sheetsSerialFromInput(round.closesAt)), cell(round.status),
        formulaCell(`="รอบจัดส่ง "&TEXT(B${rowNumber},"d mmm yyyy")`), cell(round.note),
        formulaCell(`=COUNTIF('ออเดอร์'!B:B,A${rowNumber})`),
        formulaCell(`=SUMIF('ออเดอร์'!B:B,A${rowNumber},'ออเดอร์'!J:J)`),
        formulaCell(`=IF(E${rowNumber}="เตรียมเปิด","ยังไม่แสดง",IF(E${rowNumber}<>"เปิดรับ","ปิดรับแล้ว",IF(NOW()<C${rowNumber},"ยังไม่ถึงเวลาเปิด",IF(NOW()<=D${rowNumber},"แสดงใน dropdown","ปิดรับแล้ว"))))`),
      ] }],
      fields: "userEnteredValue",
    } }] }),
  });
  return "updated";
}

export async function updateAdminRound(id: string, input: RoundInput): Promise<CmsMutationResult> {
  const round = validateRoundInput(input);
  if (roundIdFromDeliveryDate(round.deliveryDate) !== id) throw new Error("ไม่สามารถเปลี่ยนวันจัดส่งของรอบเดิมได้ กรุณาสร้างรอบใหม่");
  const rows = (await readRangesWithRenderOption(["รอบจัดส่ง!A:J"], "UNFORMATTED_VALUE"))[0];
  const index = rows.slice(1).findIndex((row) => String(row[0] ?? "") === id);
  if (index < 0) return "not_found";
  const currentRow = rows[index + 1] ?? [];
  if (input.fingerprint && await fingerprint(currentRow.slice(0, 10)) !== input.fingerprint) return "conflict";
  const rowNumber = index + 2;
  await writeRawValues([
    { range: `รอบจัดส่ง!B${rowNumber}:E${rowNumber}`, values: [[
      sheetsSerialFromInput(round.deliveryDate), sheetsSerialFromInput(round.opensAt), sheetsSerialFromInput(round.closesAt), round.status,
    ]] },
    { range: `รอบจัดส่ง!G${rowNumber}`, values: [[round.note]] },
  ]);
  return "updated";
}

export async function updateAdminStorefrontSettings(
  input: Omit<AdminStorefrontSettings, "fingerprint"> & { fingerprint?: string },
): Promise<CmsMutationResult> {
  const currentRows = (await readRangesWithRenderOption(["ตั้งค่าร้าน!A:D"], "UNFORMATTED_VALUE"))[0];
  if (input.fingerprint && await fingerprint(currentRows.slice(1).filter((row) => row[0])) !== input.fingerprint) return "conflict";
  const settings = cleanStorefrontSettings(input);
  const definitions: Array<[string, string | number, string, string]> = [
    ["store_name", settings.storeName, "ชื่อร้านบนเว็บไซต์", "พร้อมใช้"],
    ["phone_primary", settings.phonePrimary, "เบอร์โทรหลัก", "พร้อมใช้"],
    ["phone_secondary", settings.phoneSecondary, "เบอร์โทรสำรอง", "พร้อมใช้"],
    ["postal_shipping_fee", settings.shippingFee ?? "", "ค่าส่งไปรษณีย์ หน่วยบาท", settings.shippingFee === null ? "รอข้อมูล" : "พร้อมใช้"],
    ["pickup_address", settings.pickupAddress, "ที่อยู่สำหรับรับเองหน้าร้าน", settings.pickupAddress ? "พร้อมใช้" : "รอข้อมูล"],
    ["pickup_map_url", settings.pickupMapUrl, "ลิงก์นำทางสำหรับลูกค้าที่รับเองหน้าร้าน", settings.pickupMapUrl ? "พร้อมใช้" : "รอข้อมูล"],
    ["hero_title", settings.heroTitle, "หัวข้อหลักหน้าแรก", "พร้อมใช้"],
    ["hero_highlight", settings.heroHighlight, "ข้อความสีแดงใต้หัวข้อ", "พร้อมใช้"],
    ["hero_description", settings.heroDescription, "คำแนะนำร้านหน้าแรก", "พร้อมใช้"],
    ["announcement_text", settings.announcementText, "ข้อความแถบประกาศ", "พร้อมใช้"],
    ["story_title", settings.storyTitle, "หัวข้อเรื่องของร้าน", "พร้อมใช้"],
    ["story_description", settings.storyDescription, "เนื้อหาเรื่องของร้าน", "พร้อมใช้"],
    ["store_logo_url", settings.storeLogoUrl, "โลโก้ร้านบนเว็บไซต์", settings.storeLogoUrl ? "พร้อมใช้" : "รอข้อมูล"],
    ["store_cover_url", settings.storeCoverUrl, "ภาพปกส่วนบนเว็บไซต์", settings.storeCoverUrl ? "พร้อมใช้" : "รอข้อมูล"],
  ];
  const existingRows = new Map(currentRows.slice(1).map((row, index) => [String(row[0] ?? ""), index + 2]));
  let nextRow = firstBlankRow(currentRows);
  const data = definitions.map(([key, value, purpose, status]) => {
    const row = existingRows.get(key) ?? nextRow++;
    return { range: `ตั้งค่าร้าน!A${row}:D${row}`, values: [[key, value, purpose, status]] };
  });
  await writeRawValues(data);
  return "updated";
}

async function writeRawValues(data: Array<{ range: string; values: SheetScalar[][] }>): Promise<void> {
  await sheetsRequest("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

function firstBlankRow(rows: SheetScalar[][]): number {
  const index = rows.slice(1).findIndex((row) => !row[0]);
  return index < 0 ? rows.length + 1 : index + 2;
}

function padRow(row: SheetScalar[], length: number): SheetScalar[] {
  return Array.from({ length }, (_, index) => row[index] ?? "");
}

function assertSafeProductImage(imageUrl: string): void {
  if (imageUrl && safeProductImageUrl(imageUrl, googleBindings().PRODUCT_MEDIA_ORIGIN) === PRODUCT_IMAGE_PLACEHOLDER) {
    throw new Error("รูปสินค้าต้องมาจากพื้นที่รูปของร้านเท่านั้น");
  }
}

export async function appendOrder(order: NewSheetOrder): Promise<void> {
  const orderValues: Array<string | number> = [
    order.id, order.roundId, order.createdAt, order.customerName, order.phone,
    order.fulfilment === "pickup" ? "รับเองหน้าร้าน" : "จัดส่งไปรษณีย์",
    order.address, order.subtotal, order.shippingFee, order.total, order.slipKey ?? "",
    order.paymentStatus, order.orderStatus, order.note, order.adminNote, order.createdAt, "",
    order.idempotencyKey,
  ];
  const itemRows = order.items.map((item, index) => [
    `${order.id}-${String(index + 1).padStart(2, "0")}`,
    order.id,
    item.id,
    item.name,
    item.quantity,
    item.unitPrice,
    item.quantity * item.unitPrice,
    order.createdAt,
  ]);

  await sheetsRequest(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          insertDimension: {
            range: { sheetId: ORDER_SHEET_ID, dimension: "ROWS", startIndex: 1, endIndex: 2 },
            inheritFromBefore: false,
          },
        },
        {
          updateCells: {
            start: { sheetId: ORDER_SHEET_ID, rowIndex: 1, columnIndex: 0 },
            rows: [{ values: orderValues.map(cell) }],
            fields: "userEnteredValue",
          },
        },
        {
          insertDimension: {
            range: { sheetId: ORDER_ITEM_SHEET_ID, dimension: "ROWS", startIndex: 1, endIndex: 1 + itemRows.length },
            inheritFromBefore: false,
          },
        },
        {
          updateCells: {
            start: { sheetId: ORDER_ITEM_SHEET_ID, rowIndex: 1, columnIndex: 0 },
            rows: itemRows.map((values) => ({ values: values.map(cell) })),
            fields: "userEnteredValue",
          },
        },
      ],
    }),
  });
}

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const [orderRows, itemRows] = await readRanges(["ออเดอร์!A2:Q", "รายการออเดอร์!A2:H"]);
  const itemsByOrder = new Map<string, string[]>();
  for (const row of itemRows) {
    if (!row[1]) continue;
    const current = itemsByOrder.get(row[1]) ?? [];
    current.push(`${row[3]} × ${row[4]}`);
    itemsByOrder.set(row[1], current);
  }
  return orderRows.filter((row) => row[0]).map((row) => ({
    id: row[0], round_id: row[1] ?? "", customer_name: row[3] ?? "", phone: row[4] ?? "", address: row[6] ?? "",
    note: row[13] ?? "", admin_note: row[14] ?? "", subtotal: numberValue(row[7]), shipping_fee: numberValue(row[8]),
    total: numberValue(row[9]), slip_key: row[10] || null,
    payment_status: sheetPaymentStatusToApp[row[11]] ?? (row[10] ? "waiting_for_slip_review" : "waiting_for_payment"),
    order_status: sheetOrderStatusToApp[row[12]] ?? "received",
    created_at: row[2] ?? "", items: (itemsByOrder.get(row[0]) ?? []).join(", "),
    fulfilment: row[5] === "รับเองหน้าร้าน" ? "pickup" : "postal",
    tracking_number: row[16] || null,
  }));
}

export async function getPublicOrderTracking(orderId: string, phoneLast4: string): Promise<PublicOrderTracking | null> {
  const [orderRows, itemRows, roundRows] = await readRanges(["ออเดอร์!A2:R", "รายการออเดอร์!A2:H", "รอบจัดส่ง!A2:B"]);
  const row = orderRows.find((candidate) => candidate[0] === orderId);
  if (!row || !matchesPhoneLast4(row[4] ?? "", phoneLast4)) return null;
  const fulfilment = row[5] === "รับเองหน้าร้าน" ? "pickup" : "postal";
  const paymentStatus = sheetPaymentStatusToApp[row[11]] ?? (row[10] ? "waiting_for_slip_review" : "waiting_for_payment");
  const orderStatus = sheetOrderStatusToApp[row[12]] ?? "received";
  const deliveryDate = roundRows.find((round) => round[0] === row[1])?.[1] ?? "";
  const items = itemRows.filter((item) => item[1] === orderId).map((item) => ({
    name: item[3] ?? "สินค้า",
    quantity: numberValue(item[4]),
    unitPrice: numberValue(item[5]),
    lineTotal: numberValue(item[6]),
  }));

  return {
    orderId: row[0],
    maskedPhone: maskPhone(row[4] ?? ""),
    createdAt: row[2] ?? "",
    updatedAt: row[15] || row[2] || "",
    deliveryDate,
    fulfilment,
    fulfilmentLabel: fulfilment === "pickup" ? "รับเองหน้าร้าน" : "จัดส่งไปรษณีย์ · ซ่อนที่อยู่เพื่อความเป็นส่วนตัว",
    subtotal: numberValue(row[7]),
    shippingFee: numberValue(row[8]),
    total: numberValue(row[9]),
    paymentStatus,
    orderStatus,
    trackingNumber: row[16] || null,
    items,
  };
}

export async function getPublicOrdersByPhone(
  phone: string,
  options: { now?: Date; days?: number; limit?: number } = {},
): Promise<PublicOrderTracking[]> {
  const [orderRows, itemRows, roundRows] = await readRanges(["ออเดอร์!A2:R", "รายการออเดอร์!A2:H", "รอบจัดส่ง!A2:B"]);
  const now = options.now ?? new Date();
  const days = Math.max(1, Math.min(options.days ?? 30, 31));
  const limit = Math.max(1, Math.min(options.limit ?? 10, 10));
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const matchingRows = orderRows
    .filter((row) => {
      if (!matchesPhone(row[4] ?? "", phone)) return false;
      const createdAt = Date.parse(row[2] ?? "");
      return Number.isFinite(createdAt) && createdAt >= cutoff && createdAt <= now.getTime() + 5 * 60 * 1000;
    })
    .sort((left, right) => Date.parse(right[2] ?? "") - Date.parse(left[2] ?? ""))
    .slice(0, limit);

  return matchingRows.map((row) => {
    const orderId = row[0] ?? "";
    const fulfilment = row[5] === "รับเองหน้าร้าน" ? "pickup" as const : "postal" as const;
    const paymentStatus = sheetPaymentStatusToApp[row[11]] ?? (row[10] ? "waiting_for_slip_review" : "waiting_for_payment");
    const orderStatus = sheetOrderStatusToApp[row[12]] ?? "received";
    const items = itemRows.filter((item) => item[1] === orderId).map((item) => ({
      name: item[3] ?? "สินค้า",
      quantity: numberValue(item[4]),
      unitPrice: numberValue(item[5]),
      lineTotal: numberValue(item[6]),
    }));
    return {
      orderId,
      maskedPhone: maskPhone(row[4] ?? ""),
      createdAt: row[2] ?? "",
      updatedAt: row[15] || row[2] || "",
      deliveryDate: roundRows.find((round) => round[0] === row[1])?.[1] ?? "",
      fulfilment,
      fulfilmentLabel: fulfilment === "pickup" ? "รับเองหน้าร้าน" : "จัดส่งไปรษณีย์ · ซ่อนที่อยู่เพื่อความเป็นส่วนตัว",
      subtotal: numberValue(row[7]),
      shippingFee: numberValue(row[8]),
      total: numberValue(row[9]),
      paymentStatus,
      orderStatus,
      trackingNumber: row[16] || null,
      items,
    };
  });
}

export async function findOrderByIdempotencyKey(idempotencyKey: string): Promise<{ orderId: string; paymentStatus: SheetPaymentStatus } | null> {
  const response = await sheetsRequest(`/values/${encodeURIComponent("ออเดอร์!A2:R")}`);
  const result = await response.json() as SheetsValuesResponse;
  const row = result.values?.find((candidate) => candidate[17] === idempotencyKey);
  if (!row?.[0]) return null;
  const paymentStatus = row[11];
  if (!["รอชำระเงิน", "รอตรวจสลิป", "ชำระแล้ว", "สลิปไม่ถูกต้อง", "คืนเงินแล้ว"].includes(paymentStatus)) return null;
  return { orderId: row[0], paymentStatus: paymentStatus as SheetPaymentStatus };
}

export type UpdateOrderStatusResult = "updated" | "not_found" | "payment_required";

export type AdminOrderPatch = {
  paymentStatus?: PaymentStatus;
  orderStatus?: OrderStatus;
  trackingNumber?: string;
};

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<UpdateOrderStatusResult> {
  return updateAdminOrder(id, { orderStatus: status });
}

export async function updateAdminOrder(
  id: string,
  patch: AdminOrderPatch,
): Promise<UpdateOrderStatusResult> {
  const response = await sheetsRequest(`/values/${encodeURIComponent("ออเดอร์!A2:Q")}`);
  const result = await response.json() as SheetsValuesResponse;
  const index = result.values?.findIndex((row) => row[0] === id) ?? -1;
  if (index < 0) return "not_found";
  const currentOrder = result.values?.[index];
  const currentPaymentStatus = sheetPaymentStatusToApp[currentOrder?.[11] ?? ""] ?? "waiting_for_payment";
  const effectivePaymentStatus = patch.paymentStatus ?? currentPaymentStatus;
  const requestedOrderStatus = patch.orderStatus;
  const canAdvanceWithoutPayment = !requestedOrderStatus || requestedOrderStatus === "received" || requestedOrderStatus === "cancelled";
  if (!canAdvanceWithoutPayment && effectivePaymentStatus !== "paid") return "payment_required";
  if (patch.trackingNumber?.trim() && effectivePaymentStatus !== "paid") return "payment_required";

  const rowNumber = index + 2;
  const data: Array<{ range: string; values: string[][] }> = [];
  if (patch.paymentStatus) {
    data.push({ range: `ออเดอร์!L${rowNumber}`, values: [[appPaymentStatusToSheet[patch.paymentStatus]]] });
  }
  if (patch.orderStatus) {
    data.push({ range: `ออเดอร์!M${rowNumber}`, values: [[appStatusToSheet[patch.orderStatus]]] });
  }
  if (patch.trackingNumber !== undefined) {
    data.push({ range: `ออเดอร์!Q${rowNumber}`, values: [[patch.trackingNumber.trim()]] });
  }
  if (data.length === 0) return "updated";
  data.push({ range: `ออเดอร์!P${rowNumber}`, values: [[new Date().toISOString()]] });

  await sheetsRequest("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data,
    }),
  });
  return "updated";
}

export async function getOrderSlipKey(id: string): Promise<string | null> {
  const response = await sheetsRequest(`/values/${encodeURIComponent("ออเดอร์!A2:K")}`);
  const result = await response.json() as SheetsValuesResponse;
  return result.values?.find((row) => row[0] === id)?.[10] || null;
}
