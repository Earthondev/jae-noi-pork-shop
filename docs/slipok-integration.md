# SlipOK integration handoff

Status: **enabled in production since 2026-08-03** (`SLIPOK_ENABLED=true` on
`jae-noi-pork-shop-test`, branch `71368`). Local dev is deliberately left at
`false` so testing never spends the paid quota.

**Not yet proven against a real slip.** The credentials were installed and the
flag flipped, but no genuine transfer has been verified since. Watch the next
real order: an automatic `ชำระแล้ว` means the key works; every slip still landing
on `รอตรวจสลิป` means it does not. That failure is harmless — see below — but it
also means nothing is being verified.

Turn it off again with a single command, no deploy needed:

```bash
printf 'false' | npx wrangler secret put SLIPOK_ENABLED --name jae-noi-pork-shop-test
```

## What is ready

- Server-only SlipOK API client; the API key is never sent to the browser.
- File allowlist: JPG, PNG, and WebP, maximum 5 MB.
- The expected order total is sent to SlipOK with `log=true`.
- A verified response must include a Thai transaction, a transaction reference,
  and an amount equal to the server-calculated order total.
- Duplicate slips, wrong amounts, wrong receivers, and invalid slips are rejected.
- Provider delays, quota errors, timeouts, and unexpected responses fail safely
  to manual review instead of marking an order as paid.
- A small per-client throttle protects against accidental repeated checks.

## Before enabling

1. Register the shop through LINE `@slipok` and select API access.
2. Bind the receiving account for PromptPay `0931687892`.
3. Obtain the Branch ID and API key. Never paste the API key into chat or Git.
4. Put the values in local or hosted encrypted secrets.
5. Add production-grade abuse protection (Cloudflare rate limiting or Turnstile)
   before exposing the free 100-slip quota on a public website.
6. Test one genuine low-value transfer and confirm the receiver, amount,
   transaction reference, duplicate detection, Google Sheet status, and admin view.
7. Only after the checks pass, set `SLIPOK_ENABLED=true`.

## Expected status behavior

- No slip: `รอชำระเงิน`
- Slip attached while disabled or temporarily unverifiable: `รอตรวจสลิป`
- SlipOK verified: สถานะชำระเงิน `ชำระแล้ว` และสถานะออเดอร์ `รับออเดอร์แล้ว`
- Duplicate, wrong amount, wrong receiver, or invalid slip: order submission is rejected

Keep manual bank-statement checking available as the operational fallback.

## Why enabling it is low-risk

`safeReason()` in `lib/slipok.ts` rejects a slip only on specific codes — 1012
duplicate, 1013 wrong amount, 1014 wrong receiver, and 1005–1008/1011 invalid.
**Everything else, including an authentication failure, falls through to
`pending` → `รอตรวจสลิป`**, which is exactly the behaviour before it was enabled.
A wrong API key therefore degrades to manual review; it can never cause a
legitimate slip to be rejected.

Note this also means a broken key looks identical to "SlipOK is working but
nothing has come in yet". Confirm from a real order, not from the absence of
errors.

## Rejected slips are no longer a dead end

Since 2026-08-03 a customer whose slip is rejected gets **one** self-service
re-upload from `/track`, with the PromptPay QR for the order total shown next to
the file picker so they can pay again first. The budget is spent by submitting,
not by failing, and is tracked in `orders.slip_retries_used`
(`lib/slip-retry.ts`). After that the card hands them the shop's phone numbers.

The replacement slip is stored at `slips/<order_id>/retry-1`, leaving the
rejected original in place for the shop to look at when the customer rings.
