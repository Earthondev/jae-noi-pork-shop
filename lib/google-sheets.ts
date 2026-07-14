import { env } from "cloudflare:workers";
import type { AdminOrder, OrderStatus, PaymentStatus } from "../db/orders";
import { maskPhone, matchesPhoneLast4, type PublicOrderTracking } from "./order-tracking";
import { catalogProductsFromRows, type CatalogProduct } from "./product-catalog";
import { safePickupMapUrl } from "./storefront-settings";

type GoogleBindings = {
  GOOGLE_SHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  PRODUCT_MEDIA_ORIGIN?: string;
};

function googleBindings(): GoogleBindings {
  return env as unknown as GoogleBindings;
}

function spreadsheetId(): string {
  return googleBindings().GOOGLE_SHEET_ID || "10kwcEYyyOA3tIKTpmdwH21KIdpidLaiU04RC6ON6tJE";
}
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type AccessToken = { value: string; expiresAt: number };
type SheetsValuesResponse = { values?: string[][] };
type SheetsBatchGetResponse = { valueRanges?: Array<{ values?: string[][] }> };
type SheetPaymentStatus = "รอชำระเงิน" | "รอตรวจสลิป" | "ชำระแล้ว" | "สลิปไม่ถูกต้อง" | "คืนเงินแล้ว";
type SheetOrderStatus = "รับออเดอร์แล้ว" | "กำลังเตรียม" | "พร้อมรับหน้าร้าน" | "จัดส่งแล้ว" | "สำเร็จ" | "ยกเลิก";
type CellValue = { stringValue: string } | { numberValue: number };
type CellData = { userEnteredValue: CellValue };

const ORDER_SHEET_ID = 103;
const ORDER_ITEM_SHEET_ID = 104;

let cachedAccessToken: AccessToken | null = null;

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

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const credentials = serviceCredentials();
  if (!credentials) throw new Error("ยังไม่ได้ตั้งค่าบัญชีระบบ Google Sheets");

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
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description ?? "บัญชีระบบ Google ใช้งานไม่ได้");
  cachedAccessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return result.access_token;
}

async function sheetsRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(result?.error?.message ?? "เชื่อมต่อ Google Sheets ไม่สำเร็จ");
  }
  return response;
}

async function readRanges(ranges: string[]): Promise<string[][][]> {
  const query = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  for (const range of ranges) query.append("ranges", range);
  const response = await sheetsRequest(`/values:batchGet?${query.toString()}`);
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

export async function getStorefrontData() {
  const [productRows, roundRows, settingRows] = await readRanges(["สินค้า!A:I", "รอบจัดส่ง!A:J", "ตั้งค่าร้าน!A:D"]);
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

  const settings = Object.fromEntries(settingRows.slice(1).filter((row) => row[0]).map((row) => [row[0], {
    value: row[1] ?? "",
    status: row[3] ?? "รอข้อมูล",
  }]));
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
    secureWriteReady: serviceCredentials() !== null,
  };
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
    id: row[0], customer_name: row[3] ?? "", phone: row[4] ?? "", address: row[6] ?? "",
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
