# Claude Code Project Guidelines - jae-noi-pork-shop

This project is a storefront and admin panel for "Jae Noi Pork Shop" built using Next.js, vinext, Cloudflare Workers, Cloudflare D1 (SQLite database), Cloudflare R2 (media storage), and Drizzle ORM.

**The shop is live at https://jaenoishop.com with real customers and real orders.**
The `*.workers.dev` URLs are all switched off deliberately — see "Custom domain"
below before changing anything about deployment.

## CLI Commands

- **Initialize environment:** `npm run dev:setup` (creates `.dev.vars` from local templates/secrets)
- **Start development server:** `npm run dev`
- **Build project:** `npm run build`
- **Build for Cloudflare:** `npm run build:cloudflare`
- **Deploy to Cloudflare:** `npm run deploy:cloudflare` (deploys to the production-connected worker `jae-noi-pork-shop-test`)
- **Run tests:** `npm run test` (compiles and runs node unit tests in `tests/`)
- **Run E2E tests:** `npm run test:e2e` (Playwright, `tests-e2e/`) — covers the checkout + payment-QR flow in a real browser (mobile/WebKit + desktop/Chromium). Auto-starts `npm run dev` if not already running. This flow has broken twice in ways unit tests couldn't catch (a fixed-position bar losing its CSS containing block, a canvas-drawn payment amount rendering invisible white-on-white), so treat it as the regression gate for anything touching checkout, the cart drawer, or admin storefront settings.
- **Lint code:** `npm run lint` — the React Compiler rules here are not cosmetic. "Existing memoization could not be preserved" means the compiler gave up on a whole component, usually because a hoisted `function` reads a `const` declared further down; the fix is to move the declaration above its consumers, not to silence the rule.
- **Database migration generation:** `npm run db:generate`
- **Export sheet orders to D1:** `npm run db:export-sheet-orders`

## Custom domain — read before deploying

`CLOUDFLARE_CUSTOM_DOMAIN=jaenoishop.com` must be set on **every** deploy (it
lives in the gitignored `.env`; load it with `set -a && . .env && set +a`).

`vite.config.ts` sets `workers_dev: !customDomain`, so deploying without it does
not merely skip the custom domain — it drops the route, re-enables `workers.dev`,
and takes the live storefront down. `wrangler deploy` also reconciles routes
against the generated config, so **a hostname added through the Cloudflare
dashboard is detached on the next deploy**; `customDomainPatterns()` in
`vite.config.ts` is the only durable place to add one (it publishes an apex
together with its `www` form).

## Development Guidelines

### Tech Stack & Architecture

- **Framework:** Next.js with `vinext` for Cloudflare Workers integration.
- **Database:** Cloudflare D1 with Drizzle ORM (`drizzle-kit`).
- **Styling:** Tailwind CSS. Use semantic classes, responsive utilities, and maintain a premium look-and-feel.
- **Node compatibility:** >=22.13.0

### Authentication & Testing Admin Panel in Dev

- Local dev defaults to read-only for Google Sheets (`ALLOW_DEV_WRITES=false` in `.dev.vars`), but allows D1 writes.
- `ADMIN_PASSWORD_HASH` in `.dev.vars` is a PBKDF2 hash. To test the admin UI locally, run:

  ```bash
  npm run admin:hash-password
  ```

  or set a temporary password hash:

  ```bash
  cp .dev.vars /tmp/dev.vars.backup
  ADMIN_PASSWORD='SomeTempPassword123!' node --import tsx scripts/hash-admin-password.mjs > /tmp/temp_hash.txt
  # Set the hash into .dev.vars
  ```

### Local Database Access

- The local D1 database is SQLite, stored under: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`
- Find the `.sqlite` file using:

  ```bash
  find .wrangler/state/v3/d1 -iname "*.sqlite" ! -iname "metadata*"
  ```

- Make sure to stop the dev server before modifying the SQLite file directly.

### Code Style

- Use ESM (`import`/`export`) throughout.
- Keep components clean, reusable, and responsive.
- Always check `npm run lint` and `npm run test` before recommending deployment.

### This repo is edited by more than one agent at a time

A second agent works in the same working tree rather than on a branch, and it
runs `git add -A`. Consequences worth planning around:

- **Stage explicit paths, never `-A`** — otherwise you commit its half-finished
  work, and it commits yours.
- **Check `git log HEAD..origin/main` before committing.** The local tree has
  drifted a whole commit behind `origin/main` while still holding newer edits;
  committing that as-is would have reverted a deployed fix. Recover by committing
  on the old base and rebasing onto `origin/main`.
- **Build releases from a clean `git worktree`** at the pushed commit, so a deploy
  can never ship someone else's in-progress code.
- **A lint or type error in `app/admin/dashboard.tsx` or `app/globals.css` is
  usually not yours.** Confirm by applying only your edits onto a clean checkout
  before claiming or fixing it.

## Cloudflare Deployment Guidelines

### 1. Network Constraints & Troubleshooting

If Claude Code runs inside a restricted or sandboxed environment that blocks connections to `api.cloudflare.com` or `sparrow.cloudflare.com` (e.g., throwing a 403 policy denial / gateway block):

- Do not attempt to bypass or work around network policy limits.
- Instead, prompt the user to perform the deployment directly from their local terminal (host machine), which does not have these network restrictions.
- Tell the user to run the following commands in their local terminal:

  ```bash
  git pull origin main
  # Set test worker name in .dev.vars: CLOUDFLARE_WORKER_NAME=jae-noi-pork-shop-test
  npm run deploy:cloudflare
  ```

### 2. Migrations run before the deploy, never after

Applying `migrations/*.sql` to production D1 is a separate step that must happen
**first**. Deploying code that reads a column the database does not have yet takes
the admin panel down completely — `/admin` returned a client-side crash
(`no such column: carrier_code`) on every load until `0006` was applied.

`wrangler d1 migrations apply` needs a config file the repo does not keep, so
write a throwaway one pointing `migrations_dir` at `migrations/` with
`database_id 7bfa8fbb-f603-441c-bbb0-b4474cdfd2fa` (staging:
`0b46c51f-c8b4-40b5-9ff5-efa681d7c1ee`). **Check `migrations list` before
applying** — the command applies every pending file, and another agent's
unfinished migration may be sitting in the folder.

### 3. Worker secrets do not need a deploy

`wrangler secret put NAME --name jae-noi-pork-shop-test` takes effect immediately
and shows up as its own deployment entry. Do not rebuild to change one. Secrets
cannot be read back, so verify by observing behaviour, not by inspecting them.

### 4. Token Security

- Never ask the user to paste, and never write or persist, a Cloudflare API token (e.g. `cfut_...`) anywhere it could end up in a public place — chat history, commit, log file, or any file that gets checked into the repo.
- If a token is ever exposed in chat history, a file, or a commit, immediately tell the user to revoke that token right away in the Cloudflare dashboard and issue a new one.
