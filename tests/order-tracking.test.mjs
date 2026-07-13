import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTrackingLookupInput,
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

test("masks the customer phone and maps fulfilment progress", () => {
  assert.equal(maskPhone("093-168-7892"), "•••-•••-7892");
  assert.equal(trackingStepIndex("received", "postal"), 0);
  assert.equal(trackingStepIndex("preparing", "postal"), 1);
  assert.equal(trackingStepIndex("shipped", "postal"), 2);
  assert.equal(trackingStepIndex("completed", "postal"), 3);
  assert.equal(trackingStepIndex("ready_for_pickup", "pickup"), 2);
  assert.equal(trackingStepIndex("cancelled", "postal"), -1);
});

test("tracking API is private-by-default and rate limited", async () => {
  const [route, sheets] = await Promise.all([
    projectFile("app/api/orders/track/route.ts"),
    projectFile("lib/google-sheets.ts"),
  ]);

  assert.match(route, /export async function POST/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /canLookupOrder/);
  assert.match(route, /Retry-After/);
  assert.match(route, /ไม่พบออเดอร์ กรุณาตรวจสอบเลขออเดอร์และเบอร์โทร 4 ตัวท้าย/);
  assert.doesNotMatch(route, /customerName|address/);
  assert.match(sheets, /getPublicOrderTracking/);
  assert.match(sheets, /maskPhone/);
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
  assert.match(shop, /href="\/track"/);
  assert.match(css, /\.tracking-skeleton/);
  assert.match(css, /@media print/);
});
