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

## Architecture

- **Hargana core** (`src/core`): the only interface the UI uses. Reads and writes on-device storage (Dexie/IndexedDB) with an injected clock. The server is reached only through sync (#11).
- **Server** (`src/server`): Better Auth (email + password, 90-day session, no sign-up) on Postgres via Drizzle — Neon in production, PGlite locally.
- **Proxy** (`src/proxy.ts`): redirects requests without a session cookie to `/login`. API routes verify the session themselves.
- **PWA** (`public/sw.js`, `src/app/manifest.ts`): installable; the service worker (production builds only) keeps every route in `APP_ROUTES` and its assets cached so the app opens offline. Pages are network-first, hashed assets cache-first. The worker is registered as `/sw.js?v=<build id>`, so each deploy installs a fresh cache. Add new screens to `APP_ROUTES`. Icons come from `pnpm tsx scripts/make-icons.tsx`.
- **i18n**: next-intl, Bahasa Indonesia only for now (`messages/id.json`).

## Deploying to Vercel

1. Import the GitHub repo in Vercel.
2. Add a Neon Postgres database from the Vercel Marketplace (sets `DATABASE_URL`).
3. Set `BETTER_AUTH_SECRET` (random, 32+ chars) and `BETTER_AUTH_URL` (the production URL).
4. Put Neon's `DATABASE_URL` into your local `.env` temporarily, then run `pnpm db:migrate` and `pnpm user:create <email> <password>` with your real credentials. Clear `DATABASE_URL` again afterwards to go back to the local database.
