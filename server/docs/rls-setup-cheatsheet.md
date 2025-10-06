# RLS + app_role setup (plain English)

Use this when you forget the steps. Dev and prod safe.

## What we’re doing
- Create a normal database role for the app (app_role) that cannot bypass RLS.
- Optionally grant that role to your app’s DB user.
- Point the API to run queries under that role.
- Enable simple RLS policies that use per-request variables (customer/home).

## One-time prep
- Ensure `server_v2/.env` has a working `DATABASE_URL` (any user that can create roles/privileges is fine for setup).

## Create/ensure the role
- From `server_v2` folder, run:

```powershell
npm run rls:setup-role
```

What this does:
- Creates `app_role` (or `APP_DB_ROLE` name from env) with: NO SUPERUSER, NOBYPASSRLS, LOGIN.
- Grants basic privileges on `public` tables (RLS will filter rows).
- If `APP_DB_USER` is set in `.env`, it also `GRANT app_role TO APP_DB_USER`.

Optional envs in `server_v2/.env`:
- `APP_DB_ROLE=app_role` (default if missing)
- `APP_DB_USER=app_user` (optional target DB user to grant the role)

## Point the API at the right role
- Option A (prod-recommended): Use a dedicated DB user (e.g., `app_user`). In `.env` set:
  - `DATABASE_URL=postgresql://app_user:password@host:5432/dbname`
  - Ensure you ran `npm run rls:setup-role` with `APP_DB_USER=app_user` to grant the role.
- Option B (dev OK): Keep your existing user, but set:
  - `APP_DB_ROLE=app_role`
  - The server will `SET LOCAL ROLE app_role` per request so RLS applies.

## Enable/adjust RLS policies
- Example script: `server_v2/scripts/rls/sample-rls-policies.sql`
- It enables RLS on `public.products`, `public.skus`, `public.locations`, and `public.inventory_items` and creates SELECT/INSERT/UPDATE/DELETE policies that read:
  - `app.customer_id` and `app.home_ids` (set by the server per request)

Run it via pgAdmin (Query Tool) or your migration tool.

PowerShell (psql) example:
```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DBNAME" # if not already set
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f "g:\Documents\Code 2025\repos\rz_postgress\server_v2\scripts\rls\sample-rls-policies.sql"
```

## How the server sets scope
- Every request, the API derives `{ customerId, homeIds }` for the user.
- Then it wraps queries in a transaction and runs:
  - `SET LOCAL ROLE app_role` (if `APP_DB_ROLE` is set)
  - `set_config('app.customer_id', ...)` and `set_config('app.home_ids', ...)`
- RLS policies use those values to filter rows.

## Quick test
- From `server_v2`:

```powershell
npm run rls:check
```

You’ll see the current role flags and row counts filtered by allowed `home_ids`.

## Troubleshooting
- Seeing all rows? Check:
  - `APP_DB_ROLE` is set and logs show `SET LOCAL ROLE` succeeded (or connect as a user granted `app_role`).
  - You’re not connecting as a superuser in pgAdmin.
  - RLS is enabled on the table(s) you’re querying.
- Permission denied? Make sure `app_role` has `USAGE` on schema and table privileges (setup script grants these).

Useful quick checks:
```powershell
# RLS flags
psql $env:DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('products','skus','locations','inventory_items') ORDER BY relname;"

# Policies list
psql $env:DATABASE_URL -c "SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies WHERE tablename IN ('products','skus','locations','inventory_items') ORDER BY tablename, policyname;"

# Scoped read sanity for locations (home 3)
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE app_role; SELECT set_config('app.home_ids','3',true); SELECT id, home_id, name FROM public.locations ORDER BY id LIMIT 20; ROLLBACK;"

# Cross-home mismatches between items and locations
psql $env:DATABASE_URL -c "SELECT ii.id AS item_id, ii.home_id AS item_home, l.id AS location_id, l.home_id AS location_home, l.name FROM public.inventory_items ii JOIN public.locations l ON l.id = ii.location_id WHERE ii.location_id IS NOT NULL AND ii.home_id <> l.home_id ORDER BY ii.id LIMIT 100;"
```

## Keep it simple
- Superuser (postgres) → for maintenance only.
- App user (app_user) + app_role → for the API.
- Policies + GUCs → DB filters rows automatically.

Soft vs. hard delete
- If you prefer soft-deletes (e.g., `is_active=false`), you can omit DELETE policies to block hard deletes and rely on UPDATE.
