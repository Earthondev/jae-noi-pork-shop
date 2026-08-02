export const CARRIER_CODES = ["flash"] as const;

export type CarrierCode = (typeof CARRIER_CODES)[number];

const CARRIERS: Record<CarrierCode, { label: string; trackingUrl: (trackingNumber: string) => string }> = {
  flash: {
    label: "Flash Express",
    trackingUrl: (trackingNumber) => `https://www.flashexpress.com/tracking/?se=${encodeURIComponent(normalizeTrackingNumber(trackingNumber))}`,
  },
};

export function isCarrierCode(value: unknown): value is CarrierCode {
  return typeof value === "string" && (CARRIER_CODES as readonly string[]).includes(value);
}

export function carrierLabel(code: CarrierCode | null | undefined): string {
  return code ? CARRIERS[code]?.label ?? "บริษัทขนส่ง" : "บริษัทขนส่ง";
}

export function carrierTrackingUrl(code: CarrierCode | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!code || !trackingNumber || !CARRIERS[code]) return null;
  const normalized = normalizeTrackingNumber(trackingNumber);
  return normalized ? CARRIERS[code].trackingUrl(normalized) : null;
}

export function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 50);
}

export function isValidTrackingNumber(code: CarrierCode, value: string): boolean {
  const normalized = normalizeTrackingNumber(value);
  if (code === "flash") return /^TH[A-Z0-9]{8,38}$/.test(normalized);
  return false;
}
