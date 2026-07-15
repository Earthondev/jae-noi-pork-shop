export const PUBLIC_ERROR_MESSAGES = {
  STORE_UNAVAILABLE: "ขณะนี้ร้านกำลังอัปเดตข้อมูล กรุณาลองใหม่อีกครั้ง",
  ORDER_UNAVAILABLE: "ยังบันทึกคำสั่งซื้อไม่สำเร็จ ข้อมูลที่กรอกไว้ยังอยู่ กรุณาลองอีกครั้ง",
  TRACKING_UNAVAILABLE: "ยังตรวจสอบสถานะไม่ได้ กรุณาลองใหม่อีกครั้ง",
  ADMIN_UNAVAILABLE: "ระบบหลังบ้านเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  SYSTEM_UNAVAILABLE: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
} as const;

export type PublicErrorCode = keyof typeof PUBLIC_ERROR_MESSAGES;

export type PublicErrorBody = {
  code: PublicErrorCode;
  error: string;
};

export class CustomerFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerFacingError";
  }
}

export function publicErrorBody(code: PublicErrorCode): PublicErrorBody {
  return { code, error: PUBLIC_ERROR_MESSAGES[code] };
}

export function safeClientApiMessage(
  status: number,
  value: unknown,
  fallback: PublicErrorCode,
): string {
  if (status >= 500) return PUBLIC_ERROR_MESSAGES[fallback];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return PUBLIC_ERROR_MESSAGES[fallback];
  }
  const candidate = value as { error?: unknown };
  return typeof candidate.error === "string" && candidate.error.length <= 240
    ? candidate.error
    : PUBLIC_ERROR_MESSAGES[fallback];
}
