/**
 * The "สนใจรอบหน้า" counter resets itself as each round ends, so the number on
 * the storefront always means "people waiting for the round after the last one
 * that closed" — no cleanup job needed.
 */

/** Round close times are stored as Bangkok wall-clock, e.g. "2026-08-27T20:29". */
export function thaiRoundTime(value: string): number {
  return Date.parse(`${value}:00+07:00`);
}

export const ROUND_INTEREST_EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Cutoff for counting taps: the close time of the most recent round that has
 * *already* closed, or the epoch when no round has closed yet.
 *
 * Only past rounds count. Taking the maximum over every round instead would
 * let a round scheduled for later push the cutoff into the future, filtering
 * out every tap recorded in the meantime — the storefront would sit at 0
 * forever in exactly the situation the button exists for: nothing open to buy,
 * and the next round already on the books.
 */
export function lastClosedRoundCutoff(closesAtValues: readonly string[], now: Date = new Date()): string {
  const lastClosed = closesAtValues.reduce<number | null>((latest, value) => {
    const closedAt = thaiRoundTime(value);
    if (!Number.isFinite(closedAt) || closedAt > now.getTime()) return latest;
    return latest === null || closedAt > latest ? closedAt : latest;
  }, null);
  return lastClosed === null ? ROUND_INTEREST_EPOCH : new Date(lastClosed).toISOString();
}
