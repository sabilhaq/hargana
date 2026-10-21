# Hargana

Personal, offline-first price memory: scan a barcode or search an item to see what it costs here, elsewhere, and its recent low. See [REQUIREMENT.md](REQUIREMENT.md) and the spec in [issue #1](https://github.com/sabilhaq/hargana/issues/1).

## Local development

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env        # then set BETTER_AUTH_SECRET
pnpm db:migrate             # creates the embedded PGlite database in .data/
pnpm user:create            # creates the owner from DEV_OWNER_* in .env
pnpm dev
```

With `DATABASE_URL` empty, the server uses an embedded PGlite database on disk, so no external services are needed. Stop `pnpm dev` before running `db:migrate` or `user:create` (PGlite allows one process at a time).

| Script | Purpose |
|---|---|
| `pnpm build && pnpm start` | Production build — the only way to try the service worker / offline mode locally |
| `pnpm test` | Core behavior tests (fake IndexedDB + fake clock) |
| `pnpm lint` | ESLint + logical-CSS check (no `left`/`right`, `ml`/`mr` — keeps RTL possible) |
| `pnpm typecheck` | Route types + TypeScript |
| `pnpm db:generate` | Generate a migration after editing the server schema |
| `pnpm user:create [email] [password] [name]` | Create the owner account (sign-up is closed in the app) |
| `pnpm user:password <email> <new-password>` | Change a password and sign that user out everywhere |

## Architecture

- **Hargana core** (`src/core`): the only interface the UI uses. Reads and writes on-device storage (Dexie/IndexedDB) with an injected clock. The server is reached only through sync (#11). First run seeds Kabupaten Garut and the default categories (fixed ids, so devices agree).
- **Search**: Fuse.js over item names and aliases, run on the device (`searchItems` in the core); thresholds live in `src/core/catalog.ts`.
- **Barcodes**: the core validates EAN-13/EAN-8/UPC-A/UPC-E and stores canonical GTINs (`src/core/barcode.ts`). The scanner (`src/lib/barcode-detector.ts`) only reports what the camera sees: native `BarcodeDetector` on Android, zxing-wasm elsewhere (iOS). The decoder is copied to `public/zxing/<version>/` on install (`scripts/copy-zxing-wasm.mjs`) so it loads from our origin and works offline. The camera needs HTTPS (or localhost).
- **Screens** (`src/app/(app)`): client components that talk to the core via `useCoreData`; shared building blocks live in `ui.tsx`.
- **Server** (`src/server`): Better Auth (email + password, 90-day session, no sign-up) on Postgres via Drizzle — Neon in production, PGlite locally.
- **Proxy** (`src/proxy.ts`): redirects requests without a session cookie to `/login`. API routes verify the session themselves.
- **PWA** (`public/sw.js`, `src/app/manifest.ts`): installable; the service worker (production builds only) keeps every route in `APP_ROUTES` and its assets cached so the app opens offline. Pages are network-first, hashed assets cache-first. The worker is registered as `/sw.js?v=<build id>`, so each deploy installs a fresh cache. Add new screens to `APP_ROUTES`. Icons come from `pnpm tsx scripts/make-icons.tsx`.
- **i18n**: next-intl, Bahasa Indonesia only for now (`messages/id.json`).

## Deploying to Vercel

1. Import the GitHub repo in Vercel.
2. Add a Neon Postgres database from the Vercel Marketplace (sets `DATABASE_URL`).
3. Set `BETTER_AUTH_SECRET` (random, 32+ chars) and `BETTER_AUTH_URL` (the production URL).
4. Create a Blob store (Storage → Blob) and connect it to the project, for product photos. Locally, photos are kept in `.data/photos` instead.
5. Put Neon's `DATABASE_URL` into your local `.env` temporarily, then run `pnpm db:migrate` and `pnpm user:create <email> <password>` with your real credentials. Clear `DATABASE_URL` again afterwards to go back to the local database.
