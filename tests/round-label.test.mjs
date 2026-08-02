import assert from "node:assert/strict";
import test from "node:test";
import { roundLabelFromRoundId, THAI_MONTHS_FULL } from "../lib/admin-cms.ts";

test("a round id becomes a Thai Buddhist-era delivery date", () => {
  assert.equal(roundLabelFromRoundId("RD-20260804"), "รอบจัดส่ง 4 สิงหาคม 2569");
  assert.equal(roundLabelFromRoundId("RD-20260803"), "รอบจัดส่ง 3 สิงหาคม 2569");
  // Leading zeros must not survive into the day number.
  assert.equal(roundLabelFromRoundId("RD-20260101"), "รอบจัดส่ง 1 มกราคม 2569");
  assert.equal(roundLabelFromRoundId("RD-20251231"), "รอบจัดส่ง 31 ธันวาคม 2568");
});

test("every month renders with its full Thai name", () => {
  assert.equal(THAI_MONTHS_FULL.length, 12);
  for (let month = 1; month <= 12; month += 1) {
    const id = `RD-2026${String(month).padStart(2, "0")}15`;
    assert.equal(roundLabelFromRoundId(id), `รอบจัดส่ง 15 ${THAI_MONTHS_FULL[month - 1]} 2569`);
  }
});

test("anything that is not a round id is shown as itself, never as a wrong date", () => {
  assert.equal(roundLabelFromRoundId("ไม่ระบุรอบ"), "ไม่ระบุรอบ");
  assert.equal(roundLabelFromRoundId("RD-2026080"), "RD-2026080");
  assert.equal(roundLabelFromRoundId("RD-20261304"), "RD-20261304", "month 13 has no name to show");
  assert.equal(roundLabelFromRoundId(""), "ไม่ระบุรอบ");
});
