import type { OrderStatus, PaymentStatus } from "../db/orders";

const ORDER_ID_PATTERN = /^JN-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/;

export type PublicOrderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PublicOrderTracking = {
  orderId: string;
  maskedPhone: string;
  createdAt: string;
  updatedAt: string;
  deliveryDate: string;
  fulfilment: "pickup" | "postal";
  fulfilmentLabel: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  trackingNumber: string | null;
  items: PublicOrderItem[];
};

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function isTrackingLookupInput(orderId: string, phoneLast4: string): boolean {
  return ORDER_ID_PATTERN.test(orderId) && /^\d{4}$/.test(phoneLast4);
}

export function maskPhone(value: string): string {
  const last4 = normalizePhone(value).slice(-4).padStart(4, "•");
  return `•••-•••-${last4}`;
}

export function matchesPhoneLast4(phone: string, candidate: string): boolean {
  const stored = normalizePhone(phone).slice(-4);
  if (stored.length !== 4 || candidate.length !== 4) return false;
  let difference = 0;
  for (let index = 0; index < 4; index += 1) {
    difference |= stored.charCodeAt(index) ^ candidate.charCodeAt(index);
  }
  return difference === 0;
}

export function trackingStepIndex(orderStatus: OrderStatus, fulfilment: "pickup" | "postal"): number {
  if (orderStatus === "cancelled") return -1;
  if (orderStatus === "received") return 0;
  if (orderStatus === "preparing") return 1;
  if (orderStatus === "completed") return 3;
  if (fulfilment === "pickup" && orderStatus === "ready_for_pickup") return 2;
  if (fulfilment === "postal" && orderStatus === "shipped") return 2;
  return 1;
}
