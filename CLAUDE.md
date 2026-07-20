# Claude Code Project Guidelines - jae-noi-pork-shop

This project is a storefront and admin panel for "Jae Noi Pork Shop" built using Next.js, vinext, Cloudflare Workers, Cloudflare D1 (SQLite database), Cloudflare R2 (media storage), and Drizzle ORM.

## CLI Commands

- **Initialize environment:** `npm run dev:setup` (creates `.dev.vars` from local templates/secrets)
- **Start development server:** `npm run dev`
- **Build project:** `npm run build`
- **Build for Cloudflare:** `npm run build:cloudflare`
- **Deploy to Cloudflare:** `npm run deploy:cloudflare` (deploys to the production-connected worker `jae-noi-pork-shop-test`)
- **Run tests:** `npm run test` (compiles and runs node unit tests in `tests/`)
- **Lint code:** `npm run lint`
- **Database migration generation:** `npm run db:generate`
- **Export sheet orders to D1:** `npm run db:export-sheet-orders`

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

### 2. Token Security

- Never ask the user to paste, and never write or persist, a Cloudflare API token (e.g. `cfut_...`) anywhere it could end up in a public place — chat history, commit, log file, or any file that gets checked into the repo.
- If a token is ever exposed in chat history, a file, or a commit, immediately tell the user to revoke that token right away in the Cloudflare dashboard and issue a new one.
