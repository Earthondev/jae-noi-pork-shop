// A delivery round either opens the whole shop or only a hand-picked set of
// products. Every existing round is "all", so the shared helpers below treat
// "no restriction" as `null` — that keeps the untouched path (one round, whole
// shop) behaving exactly as it did before per-round products existed.

export const ROUND_PRODUCT_SCOPES = ["all", "selected"] as const;

export type RoundProductScope = (typeof ROUND_PRODUCT_SCOPES)[number];

export type RoundProductAvailability = Readonly<{
  productScope: RoundProductScope;
  productIds: readonly string[];
}>;

export function normalizeRoundProductScope(value: string | undefined): RoundProductScope {
  return value === "selected" ? "selected" : "all";
}

/** `null` means the round opens every purchasable product. */
export function roundProductIdSet(round: RoundProductAvailability | undefined): ReadonlySet<string> | null {
  if (!round || round.productScope !== "selected") return null;
  return new Set(round.productIds);
}

export function roundIncludesProduct(round: RoundProductAvailability | undefined, productId: string): boolean {
  const allowed = roundProductIdSet(round);
  return allowed === null || allowed.has(productId);
}

/**
 * Which products at least one of the open rounds accepts. Returns `null` when
 * there is no per-round restriction to apply — either a round opens the whole
 * shop, or no round is open at all (the storefront's existing "ordering
 * closed" state already covers that case, and flagging every product as
 * out-of-round on top of it would only add noise).
 */
export function openRoundProductIdSet(rounds: readonly RoundProductAvailability[]): ReadonlySet<string> | null {
  if (rounds.length === 0) return null;
  const union = new Set<string>();
  for (const round of rounds) {
    if (round.productScope !== "selected") return null;
    for (const productId of round.productIds) union.add(productId);
  }
  return union;
}
