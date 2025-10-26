# Server V2 Operational Playbook (Newbie-Friendly)

Use this when you forget how things work. It’s a practical checklist with copy‑paste commands for Windows PowerShell.

## What this stack looks like
- Next.js client calls the Express API in `server`.
- The API talks to Postgres using Drizzle ORM.
- Row Level Security (RLS) in Postgres filters data per customer/home.
- Seed data comes from your JSON files (numeric order) – not sample data.

## Environment you need
Edit `server/.env`:
- DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rental_inventory_v2
- APP_DB_ROLE=app_role (keeps RLS enforced even if DB user is powerful)
- PORT=5000
- CLIENT_URLS=http://localhost:3000,http://localhost:3001

Tip: The server will SET LOCAL ROLE app_role for each request if APP_DB_ROLE is set.

Temporary decision (dev only):
- We are committing `server/.env` and `client/.env.local` to git to avoid losing them during active development.
- This is enabled by two negation rules in the repo root `.gitignore`:
  - `!server/.env`
  - `!client/.env.local`
- When you’re ready to stop committing these files:
  1) Copy values into `server/.env.example` and `client/.env.local.example`.
  2) Remove the two negation lines from `.gitignore`.
  3) Optionally rotate secrets.

## One-time role + RLS setup
Run from `server`:

```powershell
# Create the app role and grant table permissions (safe to re-run)
npm run rls:setup-role

# Optional: grant the role to a DB user you plan to use
$env:APP_DB_USER = 'app_user'; npm run rls:setup-role

# Apply RLS policies to key tables (safe to re-run)
npm run rls:apply

# Quick sanity check: ensure you’re not using a superuser
npm run rls:check
```
If the check shows rolsuper=true or rolbypassrls=true, your session bypasses RLS. Use a normal app user or rely on APP_DB_ROLE.

## Seeding your database (your JSON, numeric order)
You have a robust seeding toolchain that works table‑by‑table with FK safety.

- Numeric end‑to‑end seed:
```powershell
npm run seed:numeric
```
What it does:
- Transforms tags JSON (adds fields, removes color) and keeps files next to originals.
- Seeds tables in dependency‑safe order (customers → users → … → inventory_items).
- Runs each table in REBUILD mode:
  - Disables foreign keys
  - Drops the table
  - Recreates it from Drizzle SQL
  - Seeds from JSON (absolute paths)
  - Re‑enables foreign keys

- Seed a single table (also REBUILD by default):
```powershell
npm run seed:table -- <tableName>
# Examples
npm run seed:table -- users
npm run seed:table -- products
```

### How drizzle-rebuild works
File: `server/scripts/drizzle/drizzle-rebuild.ts`
- Commands: rebuild (default), create, drop, seed
- Options:
  - `--seed-file=2-users.json` (absolute path OK)
  - `--seed-key=users` (JSON key; defaults to table name)
  - `--append` (don’t delete existing rows)
- Seed file lookup order:
  1) Absolute path if provided
  2) `scripts/drizzle/seed-data/<file>`
  3) `server/seed-data/<file>`
- FK safety: uses `SET session_replication_role = replica` during rebuild/seed

Examples:
```powershell
# Rebuild users from a specific file/key
npx tsx scripts/drizzle/drizzle-rebuild.ts rebuild users --seed-file=2-users.json --seed-key=users

# Seed only (no drop/create)
npx tsx scripts/drizzle/drizzle-rebuild.ts seed users --seed-file=2-users.json
```

## About Drizzle migrations meta table
- What is it? Drizzle usually creates a meta table (often named `_drizzle_migrations` or within a `drizzle` schema) to track which migrations ran.
- Why it’s missing in v2 right now: we’re using the per‑table rebuild tool that executes SQL directly (drop → create → seed) and not the Drizzle migrator, so the meta table wasn’t created.
- Is that a problem? No, not during active dev while you manage schema via the rebuild tool and numeric seeding. The app works fine.
- When you want Drizzle to “own” migrations again:
  1) Create a fresh v2 database.
  2) Run the migrator so Drizzle creates the meta table and applies migrations: `npm run db:migrate` from `server`.
  3) Reseed: `npm run seed:numeric`.
  Avoid manually faking/baselining the meta table; Drizzle stores checksums and ordering.

## Running the server
From `server`:
```powershell
npm run dev
```
It starts at http://localhost:5000

Client points to this API via `NEXT_PUBLIC_API_URL` or Next.js rewrites.

## How tenant scoping works (RLS + GUCs)
- Each request resolves a scope: `{ customerId, homeIds }`.
- The server wraps queries with `withTenantScope()`:
  - Sets GUCs: `app.customer_id`, `app.home_ids`
  - `SET LOCAL ROLE app_role` (if APP_DB_ROLE is set)
  - Executes the query
- RLS policies read those GUCs to filter data.

Dev override (only when not in production):
- Headers: `x-customer-id`, `x-home-ids` (comma list)
- Query or header: `homeId` selects a single allowed home

## Common routes to verify
- GET http://localhost:5000/api/products
- GET http://localhost:5000/api/skus
- GET http://localhost:5000/api/inventory-items
- GET http://localhost:5000/api/locations
- GET http://localhost:5000/api/table/products
- GET http://localhost:5000/api/table/skus

**Component (BOM) Support**:
- POST /api/products/composite - Create product with components
- POST /api/skus/composite - Create SKU with components
- See `docs/components-api.md` for full BOM documentation

If you see 42501 "permission denied", jump to troubleshooting below.

## Troubleshooting quick fixes
### Run arbitrary SQL (transactional)
From `server`, you can execute a .sql file safely in a single transaction:

```powershell
npm run -s db:run-sql scripts/sql/examples/fix-products-seq.sql
```

Use this for targeted patches (RLS tweaks, sequence alignment, etc.). The runner splits on Drizzle `--> statement-breakpoint` markers or on semicolon+newline.

### Duplicate key on products_pkey (sequence drift)
- Symptom: inserting into products fails with `duplicate key value violates constraint "products_pkey"`.
- Fix: align the sequence to MAX(id)+1 with the example patch above.

To fix all sequences in one go (public schema):

```powershell
npm run -s db:fix-sequences
```

- 42501 permission denied
  - RLS policies may not be applied → `npm run rls:apply`
  - Role missing or not used → `npm run rls:setup-role`; ensure APP_DB_ROLE=app_role in `.env`
  - Superuser bypasses RLS → connect as a non‑superuser or rely on APP_DB_ROLE (check with `npm run rls:check`)

- Seeing everything (RLS not filtering)
  - You’re connected as superuser (rolsuper=true or rolbypassrls=true)
  - APP_DB_ROLE not set or failed

- Seed failures
  - Wrong seed path → use absolute `--seed-file`
  - FK violations → use `rebuild` (it disables FKs), or run `npm run seed:numeric`
  - Empty table after seed → check JSON key matches table name or pass `--seed-key`

- Path gotchas (Windows)
  - Prefer running from `server` folder
  - Seed scripts resolve absolute paths; if in doubt, pass an absolute `--seed-file`

## One‑page Quick Start
```powershell
# From server
$env:APP_DB_USER='app_user'; npm run rls:setup-role
npm run rls:apply
npm run seed:numeric
npm run dev
```
Open: http://localhost:5000/api/table/products

You’re good to go. Keep this doc in `server/docs/operational-playbook.md`. 🚀
