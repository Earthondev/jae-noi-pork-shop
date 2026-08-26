import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTrackingLookupInput,
  isPhoneTrackingLookupInput,
  matchesPhone,
  matchesPhoneLast4,
  maskPhone,
  trackingStepIndex,
} from "../lib/order-tracking.ts";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("requires a secure order number and exactly four phone digits", () => {
  assert.equal(isTrackingLookupInput("JN-20260716-7G4K2P9ABC", "7892"), true);
  assert.equal(isTrackingLookupInput("JN-20260716-7G4K2P9ABC", "789"), false);
  assert.equal(isTrackingLookupInput("JN-20260716-OOOOOOOOOO", "7892"), false);
  assert.equal(isTrackingLookupInput("JN-20260716-7G4K2P9ABC<script>", "7892"), false);
});

test("accepts a full Thai phone number and compares it without formatting", () => {
  assert.equal(isPhoneTrackingLookupInput("093-168-7892"), true);
  assert.equal(isPhoneTrackingLookupInput("931687892"), false);
  assert.equal(isPhoneTrackingLookupInput("09316878921"), false);
  // No +66 -> 0 conversion anywhere in the repo (checkout's own regex rejects
  // "+66" at write time, so no such rows exist to look up); a customer who
  // types the international form gets the validation message, not a silent
  // empty result.
  assert.equal(isPhoneTrackingLookupInput("+66931687892"), false);
  assert.equal(matchesPhone("093-168-7892", "0931687892"), true);
  assert.equal(matchesPhone("093-168-7892", "0931687893"), false);
  assert.equal(matchesPhoneLast4("093-168-7892", "7892"), true);
  assert.equal(matchesPhoneLast4("093-168-7892", "7893"), false);
});

test("masks the customer phone and maps fulfilment progress", () => {
  assert.equal(maskPhone("093-168-7892"), "•••-•••-7892");
  assert.equal(trackingStepIndex("received", "postal"), 0);
  assert.equal(trackingStepIndex("preparing", "postal"), 1);
  assert.equal(trackingStepIndex("shipped", "postal"), 2);
  assert.equal(trackingStepIndex("completed", "postal"), 3);
  assert.equal(trackingStepIndex("ready_for_pickup", "pickup"), 2);
  assert.equal(trackingStepIndex("cancelled", "postal"), -1);
});

test("tracking API is phone-only, private-by-default, and rate limited per-IP and per-phone", async () => {
  const [route, repository] = await Promise.all([
    projectFile("app/api/orders/track/route.ts"),
    projectFile("db/order-repository.ts"),
  ]);

  assert.match(route, /export async function POST/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /checkRateLimit/);
  assert.match(route, /Retry-After/);
  assert.match(route, /isPhoneTrackingLookupInput/);
  assert.match(route, /"tracking-rate"/);
  assert.match(route, /"tracking-phone-day"/);
  assert.match(route, /MAX_LOOKUPS_PER_PHONE_WINDOW\s*=\s*10/);
  assert.doesNotMatch(route, /customerName|address/);
  assert.match(repository, /getPublicOrdersByPhone/);
  assert.match(repository, /matchesPhone\(/);
  assert.match(repository, /phone_normalized = \?/);
  assert.match(route, /days:\s*30/);
  assert.match(repository, /maskPhone/);
});

test("tracking page has accessible progress and paid-only receipt actions", async () => {
  const [tracker, shop, css] = await Promise.all([
    projectFile("app/track/order-tracker.tsx"),
    projectFile("app/shop.tsx"),
    projectFile("app/globals.css"),
  ]);

  assert.match(tracker, /aria-label="ความคืบหน้าออเดอร์"/);
  assert.match(tracker, /aria-current/);
  assert.match(tracker, /paymentStatus === "paid"/);
  assert.match(tracker, /บันทึกเป็นรูป PNG/);
  assert.match(tracker, /พิมพ์หรือบันทึก PDF/);
  assert.match(tracker, /phoneLast4/);
  assert.match(tracker, /เลขออเดอร์/);
  // The whole point of this feature is looking up by phone alone — the guard
  // that used to forbid `JSON.stringify({ phone })` protected the old
  // two-factor design (order id + last-4 digits). That tradeoff was a
  // deliberate, user-confirmed decision (see the plan's "Security tradeoff"
  // section), not an oversight — don't reintroduce the old guard.
  assert.match(tracker, /JSON\.stringify\(\{ phone \}\)/);
  assert.match(tracker, /"ค้นหาออเดอร์"/);
  assert.doesNotMatch(tracker, /โดยไม่แสดงชื่อ ที่อยู่ หรือสลิป/);
  assert.match(shop, /href="\/track"/);
  assert.match(css, /\.tracking-skeleton/);
  assert.match(css, /\.track-history-card/);
  assert.match(css, /\.track-empty/);
  assert.match(css, /@media print/);
});
