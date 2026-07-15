# Safe error monitoring

The storefront shows only stable Thai recovery messages. Unexpected failures are
reported without customer names, phone numbers, addresses, slips, request
bodies, cookies, authorization headers, raw error messages, or query strings.

## Runtime controls

- Identical failures are accepted once per 15-minute window.
- At most 100 regular events are accepted per UTC day.
- One additional `monitoring_daily_cap_reached` event can be sent when the cap
  is reached. The maximum is therefore 101 Sentry events per day.
- R2 coordinates these limits across Worker instances. A local in-memory gate
  is used only when R2 itself is unavailable.
- Monitoring delivery has a two-second timeout and never blocks the customer
  response.

## Production setup

1. Create a Sentry JavaScript project on the free plan.
2. Store its DSN as the Cloudflare Worker secret `SENTRY_DSN`.
3. Keep `SENTRY_ENVIRONMENT=production` and set a release identifier during the
   build when available.
4. In Sentry, enable Spike Protection.
5. Enable spike email alerts and usage notifications for the owner email. Keep
   the near-quota and depleted notifications enabled.
6. Create an external uptime monitor for `/api/storefront`. It must make a real
   GET request every minute, use a five-second timeout, require HTTP 2xx, and
   assert that `$.content.storeName` equals `เจ๊น้อย เขียงหมูตะคร้อ`. Open an
   issue after three consecutive failures and resolve it after one success.
7. Send one controlled test event and one uptime test notification, then verify
   that both arrive at the owner mailbox.

The uptime monitor must be external. Code running inside the Worker cannot
report when the Worker is completely unavailable.

## Operator response

Use the event name, operation, release and incident ID to locate the failing
code path. Google Sheets, R2, SlipOK, admin operations, route rendering and the
outer Worker boundary have separate event names. Never add customer content to
monitoring tags while investigating an incident.
