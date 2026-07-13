# SlipOK integration handoff

Status: **prepared in code, disabled, and not consuming quota**.

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
