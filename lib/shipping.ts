export type ShippingPromotion = Readonly<{
  shippingFee: number | null;
  freeShippingMinimum: number | null;
}>;

export function postalShippingCost(subtotal: number, promotion: ShippingPromotion): number | null {
  if (promotion.shippingFee === null) return null;
  if (isEnabledMinimum(promotion.freeShippingMinimum) && subtotal >= promotion.freeShippingMinimum) return 0;
  return promotion.shippingFee;
}

export function amountUntilFreeShipping(subtotal: number, freeShippingMinimum: number | null | undefined): number | null {
  if (!isEnabledMinimum(freeShippingMinimum)) return null;
  return Math.max(0, freeShippingMinimum - subtotal);
}

function isEnabledMinimum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
