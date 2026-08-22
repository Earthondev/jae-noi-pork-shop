import assert from "node:assert/strict";
import test from "node:test";
import { ROUND_INTEREST_EPOCH, lastClosedRoundCutoff } from "../lib/round-interest.ts";

const now = new Date("2026-08-22T02:00:00.000Z"); // 09:00 Bangkok

test("counts everything before any round has closed", () => {
  assert.equal(lastClosedRoundCutoff([], now), ROUND_INTEREST_EPOCH);
  assert.equal(lastClosedRoundCutoff(["2026-08-27T20:29"], now), ROUND_INTEREST_EPOCH);
});

test("resets the count at the most recent round that already closed", () => {
  const cutoff = lastClosedRoundCutoff(["2026-07-20T23:59", "2026-08-14T18:00"], now);
  assert.equal(cutoff, new Date("2026-08-14T18:00:00+07:00").toISOString());
});

// The bug this guards: a round scheduled for later used to win MAX(closes_at)
// and push the cutoff into the future, so every tap taken while waiting for
// that round was filtered back out and the storefront showed 0 forever.
test("a round scheduled for later never moves the cutoff", () => {
  const closedOnly = lastClosedRoundCutoff(["2026-07-20T23:59"], now);
  const withFutureRound = lastClosedRoundCutoff(["2026-07-20T23:59", "2026-09-29T20:00"], now);
  assert.equal(withFutureRound, closedOnly);
  assert.ok(new Date(withFutureRound).getTime() < now.getTime());
});

test("ignores an unparsable close time instead of counting nothing", () => {
  const cutoff = lastClosedRoundCutoff(["ไม่ใช่วันที่", "2026-07-20T23:59"], now);
  assert.equal(cutoff, new Date("2026-07-20T23:59:00+07:00").toISOString());
});
