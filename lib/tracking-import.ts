import type { CarrierCode } from "./carriers";
import { isValidTrackingNumber, normalizeTrackingNumber } from "./carriers";
import { maskPhone } from "./order-tracking";

export const MAX_TRACKING_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_TRACKING_IMPORT_ROWS = 500;

const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const FLASH_HEADERS = ["Pickup Date", "Order no", "Tracking number", "Consignee", "Phone number", "Address"] as const;

type CellValue = string | number | boolean | Date | null | undefined;

export type TrackingWorkbookInput = Readonly<{
  name: string;
  contentType: string;
  bytes: Uint8Array;
}>;

export type ParsedTrackingRow = Readonly<{
  sourceRow: number;
  pickupDate: string;
  orderReference: string;
  trackingNumber: string;
  consignee: string;
  phoneNormalized: string;
  address: string;
}>;

export type ParsedTrackingWorkbook = Readonly<{
  carrierCode: CarrierCode;
  originalFilename: string;
  fileHash: string;
  rows: ParsedTrackingRow[];
  ignoredRows: number;
}>;

export type TrackingImportCandidate = Readonly<{
  orderId: string;
  customerName: string;
  maskedPhone: string;
  deliveryDate: string;
  createdAt: string;
  currentTrackingNumber: string | null;
}>;

export type TrackingImportRowStatus = "matched" | "ambiguous" | "unmatched" | "ineligible" | "already_imported" | "conflict";

export type TrackingImportPreviewRow = ParsedTrackingRow & Readonly<{
  status: TrackingImportRowStatus;
  reason: string;
  suggestedOrderId: string | null;
  candidates: TrackingImportCandidate[];
}>;

export type TrackingImportPreview = Readonly<{
  carrierCode: CarrierCode;
  carrierLabel: string;
  originalFilename: string;
  fileHash: string;
  ignoredRows: number;
  alreadyCommitted: boolean;
  rows: TrackingImportPreviewRow[];
}>;

export type TrackingImportSelection = Readonly<{
  sourceRow: number;
  orderId: string;
}>;

export type TrackingImportCommitResult = Readonly<{
  importId: string;
  duplicate: boolean;
  imported: Array<Readonly<{ orderId: string; trackingNumber: string; carrierCode: CarrierCode }>>;
}>;

export type TrackingMatchOrder = Readonly<{
  id: string;
  customer_name: string;
  phone: string;
  fulfilment: "pickup" | "postal";
  payment_status: string;
  order_status: string;
  tracking_number: string | null;
  carrier_code: string | null;
  delivery_date: string;
  created_at: string;
}>;

export class TrackingImportValidationError extends Error {}

export function evaluateTrackingMatch(source: ParsedTrackingRow, orders: TrackingMatchOrder[], carrierCode: CarrierCode): TrackingImportPreviewRow {
  const allCandidates = orders.map(toCandidate);
  const sameTracking = orders.find((order) => order.tracking_number === source.trackingNumber && order.carrier_code === carrierCode);
  if (sameTracking) return matchResult(source, "already_imported", "เลขพัสดุนี้อยู่ในออเดอร์แล้ว", sameTracking.id, [toCandidate(sameTracking)]);

  const exactOrderReference = /^JN-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/.test(source.orderReference);
  const eligible = orders.filter(isImportEligible);
  if (exactOrderReference) {
    const exact = orders[0];
    if (!exact) return matchResult(source, "unmatched", "ไม่พบเลขออเดอร์นี้ในระบบ", null, []);
    if (!isImportEligible(exact)) {
      const status = exact.tracking_number ? "conflict" : "ineligible";
      const reason = exact.tracking_number ? "ออเดอร์นี้มีเลขพัสดุอื่นอยู่แล้ว" : "ออเดอร์นี้ยังไม่พร้อมจัดส่งหรือไม่ได้จัดส่งทางขนส่ง";
      return matchResult(source, status, reason, null, [toCandidate(exact)]);
    }
    return matchResult(source, "matched", "จับคู่ด้วยเลขออเดอร์", exact.id, [toCandidate(exact)]);
  }

  if (eligible.length === 1) return matchResult(source, "matched", "พบออเดอร์ที่ชำระแล้วจากเบอร์โทรเพียงรายการเดียว", eligible[0].id, eligible.map(toCandidate));
  if (eligible.length > 1) return matchResult(source, "ambiguous", "เบอร์โทรนี้มีหลายออเดอร์ กรุณาเลือกให้ถูกต้อง", null, eligible.map(toCandidate));
  if (orders.some((order) => order.tracking_number)) return matchResult(source, "conflict", "ออเดอร์จากเบอร์นี้มีเลขพัสดุอื่นอยู่แล้ว", null, allCandidates);
  if (orders.length > 0) return matchResult(source, "ineligible", "พบออเดอร์ แต่ยังไม่ชำระแล้ว ปิดงานแล้ว หรือไม่ใช่การจัดส่ง", null, allCandidates);
  return matchResult(source, "unmatched", "ไม่พบออเดอร์จากเลขออเดอร์หรือเบอร์โทรนี้", null, []);
}

export async function parseTrackingWorkbook(input: TrackingWorkbookInput, carrierCode: CarrierCode): Promise<ParsedTrackingWorkbook> {
  validateInput(input);
  const format = detectFormat(input.name, input.bytes);
  const XLSX = await import("xlsx");
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(input.bytes, {
      type: "array",
      raw: true,
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookDeps: false,
      bookFiles: false,
      bookProps: false,
      bookVBA: false,
      sheetRows: MAX_TRACKING_IMPORT_ROWS + 12,
      WTF: true,
      ...(format === "csv" ? { codepage: 65001 } : {}),
    });
  } catch {
    throw new TrackingImportValidationError("ไฟล์เสียหาย มีการเข้ารหัส หรือระบบไม่สามารถอ่านข้อมูลได้");
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new TrackingImportValidationError("ไม่พบตารางข้อมูลในไฟล์");
  const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  const headerIndex = matrix.slice(0, 10).findIndex((row) => isFlashHeaderRow(row));
  if (headerIndex < 0) throw new TrackingImportValidationError("ไม่พบหัวตาราง Flash ที่รองรับ กรุณาใช้ไฟล์ Pickup List จาก Flash Express");

  const headers = matrix[headerIndex].map((value) => cleanHeader(value));
  const column = new Map(headers.map((header, index) => [header, index]));
  const parsed: ParsedTrackingRow[] = [];
  let ignoredRows = 0;
  const seenTrackingNumbers = new Set<string>();

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const sourceRow = index + 1;
    const firstValue = safeCell(row[0], 80);
    const trackingNumber = normalizeTrackingNumber(safeCell(row[column.get("Tracking number") ?? -1], 100));
    const phoneNormalized = normalizeThaiPhone(safeCell(row[column.get("Phone number") ?? -1], 40));
    if (/^total$/i.test(firstValue) || (!trackingNumber && !phoneNormalized)) {
      ignoredRows += 1;
      continue;
    }
    if (!isValidTrackingNumber(carrierCode, trackingNumber)) {
      ignoredRows += 1;
      continue;
    }
    if (!phoneNormalized && !safeCell(row[column.get("Order no") ?? -1], 64)) {
      ignoredRows += 1;
      continue;
    }
    if (seenTrackingNumbers.has(trackingNumber)) {
      ignoredRows += 1;
      continue;
    }
    seenTrackingNumbers.add(trackingNumber);
    parsed.push({
      sourceRow,
      pickupDate: safeCell(row[column.get("Pickup Date") ?? -1], 80),
      orderReference: safeCell(row[column.get("Order no") ?? -1], 64).toUpperCase(),
      trackingNumber,
      consignee: safeCell(row[column.get("Consignee") ?? -1], 160),
      phoneNormalized,
      address: safeCell(row[column.get("Address") ?? -1], 600),
    });
  }

  if (matrix.length > MAX_TRACKING_IMPORT_ROWS + headerIndex + 2) {
    throw new TrackingImportValidationError(`ไฟล์มีรายการเกิน ${MAX_TRACKING_IMPORT_ROWS} แถว กรุณาแบ่งไฟล์ก่อนนำเข้า`);
  }
  if (parsed.length === 0) throw new TrackingImportValidationError("ไม่พบรายการพัสดุที่มีเลขติดตามและข้อมูลผู้รับครบถ้วน");

  return {
    carrierCode,
    originalFilename: safeFilename(input.name),
    fileHash: await sha256Hex(input.bytes),
    rows: parsed,
    ignoredRows,
  };
}

function validateInput(input: TrackingWorkbookInput): void {
  if (input.bytes.byteLength <= 0) throw new TrackingImportValidationError("ไฟล์ไม่มีข้อมูล");
  if (input.bytes.byteLength > MAX_TRACKING_IMPORT_BYTES) throw new TrackingImportValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  if (input.name.length > 180) throw new TrackingImportValidationError("ชื่อไฟล์ยาวเกินไป");
}

function detectFormat(name: string, bytes: Uint8Array): "xls" | "xlsx" | "csv" {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "xls" && hasMagic(bytes, XLS_MAGIC)) return "xls";
  if (extension === "xlsx" && hasMagic(bytes, ZIP_MAGIC)) return "xlsx";
  if (extension === "csv" && looksLikeText(bytes)) return "csv";
  throw new TrackingImportValidationError("ชนิดไฟล์ไม่ตรงกับเนื้อหา รองรับเฉพาะ .xls, .xlsx และ .csv ที่ถูกต้อง");
}

function isFlashHeaderRow(row: CellValue[]): boolean {
  const normalized = new Set(row.map((value) => cleanHeader(value)));
  return FLASH_HEADERS.every((header) => normalized.has(header));
}

function cleanHeader(value: CellValue): string {
  return safeCell(value, 100).replace(/\s+/g, " ").trim();
}

function safeCell(value: CellValue, maxLength: number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  }
  return "";
}

function normalizeThaiPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^[689]\d{8}$/.test(digits)) return `0${digits}`;
  return /^0\d{9}$/.test(digits) ? digits : "";
}

function safeFilename(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim().slice(0, 180) || "tracking-import";
}

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.byteLength >= magic.length && magic.every((value, index) => bytes[index] === value);
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 1024));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isImportEligible(order: TrackingMatchOrder): boolean {
  return order.fulfilment === "postal"
    && order.payment_status === "paid"
    && order.order_status !== "cancelled"
    && order.order_status !== "completed"
    && !order.tracking_number;
}

function toCandidate(order: TrackingMatchOrder): TrackingImportCandidate {
  return {
    orderId: order.id,
    customerName: order.customer_name,
    maskedPhone: maskPhone(order.phone),
    deliveryDate: order.delivery_date,
    createdAt: order.created_at,
    currentTrackingNumber: order.tracking_number,
  };
}

function matchResult(
  source: ParsedTrackingRow,
  status: TrackingImportPreviewRow["status"],
  reason: string,
  suggestedOrderId: string | null,
  candidates: TrackingImportCandidate[],
): TrackingImportPreviewRow {
  return { ...source, status, reason, suggestedOrderId, candidates };
}
