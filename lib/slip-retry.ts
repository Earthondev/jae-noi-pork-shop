import type { PaymentStatus } from "../db/orders";

// A customer whose slip was rejected gets exactly one self-service re-upload.
// The budget is spent by *submitting* a replacement, not by failing one — a
// second rejection and a second "still can't read it" both end the same way,
// with the shop taking over by phone. Anything looser turns the retry into an
// unbounded retry loop against a paid verification API.
export const MAX_SLIP_RETRIES = 1;

export type SlipRetryState = Readonly<{
  paymentStatus: PaymentStatus;
  slipRetriesUsed: number;
}>;

export function slipRetriesLeft(order: SlipRetryState): number {
  const used = Number.isFinite(order.slipRetriesUsed) ? Math.max(0, Math.trunc(order.slipRetriesUsed)) : MAX_SLIP_RETRIES;
  return Math.max(0, MAX_SLIP_RETRIES - used);
}

/** Only a rejected slip can be replaced — a paid or pending-review order has nothing to fix. */
export function canReuploadSlip(order: SlipRetryState): boolean {
  return order.paymentStatus === "invalid_slip" && slipRetriesLeft(order) > 0;
}

/** The customer is out of self-service options and has to reach the shop directly. */
export function mustContactShop(order: SlipRetryState): boolean {
  return order.paymentStatus === "invalid_slip" && slipRetriesLeft(order) === 0;
}
