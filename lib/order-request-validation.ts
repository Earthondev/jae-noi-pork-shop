export type OrderItemRequest = { productId?: string; quantity?: number };

export class OrderPayloadValidationError extends Error {}

const MAX_ORDER_ITEMS = 50;
const MAX_CUSTOMER_NAME_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;

export function validateOrderRequestFields(input: { customerName: string; note: string }): void {
  if (input.customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
    throw new OrderPayloadValidationError("ชื่อลูกค้ายาวเกินไป กรุณากรอกไม่เกิน 100 ตัวอักษร");
  }
  if (input.note.length > MAX_NOTE_LENGTH) {
    throw new OrderPayloadValidationError("หมายเหตุยาวเกินไป กรุณากรอกไม่เกิน 500 ตัวอักษร");
  }
}

export function validateOrderItemInputs(value: unknown): OrderItemRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OrderPayloadValidationError("ไม่พบสินค้าในตะกร้า");
  }
  if (value.length > MAX_ORDER_ITEMS) {
    throw new OrderPayloadValidationError("สินค้าในตะกร้ามากเกินไป กรุณาลดจำนวนรายการ");
  }
  const seen = new Set<string>();
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new OrderPayloadValidationError("ข้อมูลสินค้าไม่ถูกต้อง");
    }
    const candidate = raw as OrderItemRequest;
    if (typeof candidate.productId !== "string" || !candidate.productId) {
      throw new OrderPayloadValidationError("ข้อมูลสินค้าไม่ถูกต้อง");
    }
    if (seen.has(candidate.productId)) {
      throw new OrderPayloadValidationError("พบสินค้าซ้ำในตะกร้า กรุณาโหลดหน้าใหม่");
    }
    seen.add(candidate.productId);
    return candidate;
  });
}

export function detectSupportedImageType(bytes: Uint8Array): { extension: "jpg" | "png" | "webp"; contentType: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}
