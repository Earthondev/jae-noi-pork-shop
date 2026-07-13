const ORDER_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function deliveryDateKeyFromRoundId(roundId: string): string {
  const match = /^RD-(\d{8})$/.exec(roundId);
  if (!match) throw new TypeError("รหัสรอบจัดส่งไม่อยู่ในรูปแบบ RD-YYYYMMDD");
  return match[1];
}

export async function createSecureOrderId(roundId: string, idempotencyKey: string): Promise<string> {
  const deliveryDateKey = deliveryDateKeyFromRoundId(roundId);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(idempotencyKey)),
  );
  const suffix = Array.from(
    digest.slice(0, 10),
    (byte) => ORDER_ID_ALPHABET[byte & 31],
  ).join("");
  return `JN-${deliveryDateKey}-${suffix}`;
}
