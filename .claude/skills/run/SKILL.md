---
name: run
description: Launch and test the jae-noi-pork-shop storefront + admin locally (Next.js/vinext on Cloudflare Workers, D1 database), including how to test admin-only pages without knowing the real password, and how to inspect local/production D1 data safely.
---

# Running jae-noi-pork-shop locally

## Start the dev server

```bash
npm install                # first time only
npm run dev:setup          # first time only — creates .dev.vars from secrets kept outside the repo
npm run dev
```

- Serves at `http://localhost:3000` (also `http://localhost:3000/__debug`).
- `npm run dev` runs `dev:doctor` first, which validates `.dev.vars` and fails fast with a clear reason instead of showing a blank storefront.
- Local dev defaults to **read-only** (`ALLOW_DEV_WRITES=false` in `.dev.vars`) for **Google Sheets** writes only — this does **not** block D1 writes. Creating a product, round, or order in the local admin/storefront **does write to the local D1 database** for real. Clean up any test records you create (see "Local D1 access" below) instead of assuming they're sandboxed.
- Wait ~8–12s after starting before hitting the URL; check `tail -f /tmp/*.log` (or wherever you redirected stdout) for `➜ Local: http://localhost:3000/` before assuming it's ready.
- To restart cleanly: `pkill -f "vinext dev"; pkill -f "run-local-dev.mjs"` then start again.

## Testing the admin panel without the real password

`ADMIN_PASSWORD_HASH` in `.dev.vars` is a pbkdf2 hash — there is no plaintext to recover, and there is no dev bypass/fallback login. To test the admin UI as an actual authenticated session:

```bash
cp .dev.vars /tmp/dev.vars.backup                 # 1. back up
ADMIN_PASSWORD='SomeTempPassword123!' node --import tsx scripts/hash-admin-password.mjs > /tmp/temp_hash.txt
node -e '
  const fs = require("fs");
  const hash = fs.readFileSync("/tmp/temp_hash.txt", "utf8").trim();
  let content = fs.readFileSync(".dev.vars", "utf8");
  content = content.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`);
  fs.writeFileSync(".dev.vars", content);
'                                                   # 2. swap in a temp hash
# 3. restart the dev server so it picks up the new .dev.vars, then log in at
#    /admin/login with ADMIN_USERNAME (already in .dev.vars, usually "admin")
#    and the temp password you chose above.
# 4. when done, restore and restart:
cp /tmp/dev.vars.backup .dev.vars
rm -f /tmp/dev.vars.backup /tmp/temp_hash.txt
# restart the dev server again
```

The 8-hour admin session cookie persists across dev-server restarts as long as the browser tab stays open, so you often don't need to re-login after the first time in a session.

## Local D1 access (read/write, for verifying or cleaning up test data)

The local D1 database is a plain sqlite file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. Find it once with:

```bash
find .wrangler/state/v3/d1 -iname "*.sqlite" ! -iname "metadata*"
```

Then query/edit it directly with `sqlite3` while the dev server is **stopped** (avoid writing while `wrangler`/miniflare has it open):

```bash
sqlite3 "<path>.sqlite" "SELECT id, name, status FROM products;"
sqlite3 "<path>.sqlite" "DELETE FROM orders WHERE id='<test-order-id>';"   # cleanup after manual testing
```

Tables: `products`, `delivery_rounds`, `storefront_settings` (generic key/value — e.g. `promptpay_id`, `promptpay_name`, `postal_shipping_fee`), `orders`, `order_items`, `cms_imports`.

## Production/staging D1 (read-only checks — be careful, this is real data)

Wrangler is already authenticated to the Cloudflare account for this project. Known resources:

- D1 databases: `jae-noi-pork-shop` (production) and `jae-noi-pork-shop-staging`.
- Worker: `jae-noi-pork-shop-test` (this is the one actually wired to the production D1 database and gets deployed to — the "-test" in the name is just its literal name, not an indicator it's a sandbox).

```bash
npx wrangler d1 execute jae-noi-pork-shop --remote --command "SELECT count(*) FROM orders;"
```

Never run write/DELETE statements against the remote production database without explicit user confirmation — this shop has real customers and real orders in it.

## Deploying

`npm run deploy:cloudflare` requires `CLOUDFLARE_WORKER_NAME`, `CLOUDFLARE_D1_DATABASE_NAME`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_PRODUCT_MEDIA_BUCKET_NAME` as real (non-.dev.vars) environment variables — these are not stored in the repo. Confirm with the user before deploying; this project has previously had a live shop running on it.

## Heads-up: this repo is sometimes edited concurrently

A separate Claude Code (web) session has, in the past, worked on this exact repo directory at the same time as a local CLI session. Symptoms: `git status` unexpectedly clean when you didn't commit, or commits appearing with messages that don't match what you changed. If you see this, don't assume your edits were lost — `grep` for them first, they're usually still there, just bundled into someone else's commit. Avoid running two sessions against this repo at once when possible.
