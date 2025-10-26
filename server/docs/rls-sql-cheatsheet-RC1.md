# RLS SQL Cheatsheet (copy/paste)

Windows PowerShell-friendly commands and SQL to set up, verify, and troubleshoot RLS.

## Apply idempotent RLS policies

```powershell
# If needed, set your connection
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DBNAME"

# Apply the script (safe to re-run)
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f "g:\Documents\Code 2025\repos\rz_postgress\server\scripts\rls\sample-rls-policies.sql"
```

## Verify RLS is enabled and policies exist

```powershell
# RLS flags on covered tables
psql $env:DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('products','skus','locations','inventory_items') ORDER BY relname;"

# Policy list
psql $env:DATABASE_URL -c "SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies WHERE tablename IN ('products','skus','locations','inventory_items') ORDER BY tablename, policyname;"
```

## Quick scoped tests (transaction rolls back)

```powershell
# Locations (home-scoped)
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE app_role; SELECT set_config('app.home_ids','3',true); SELECT id, home_id, name FROM public.locations ORDER BY id LIMIT 20; ROLLBACK;"

# SKUs (customer-scoped)
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE app_role; SELECT set_config('app.customer_id','2',true); SELECT count(*) AS skus_for_customer FROM public.skus; ROLLBACK;"

# Inventory items (both scopes)
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE app_role; SELECT set_config('app.customer_id','2',true); SELECT set_config('app.home_ids','3',true); SELECT count(*) AS inventory_for_home FROM public.inventory_items; ROLLBACK;"
```

## Troubleshooting data mismatches

```powershell
# Items pointing to a location in a different home
psql $env:DATABASE_URL -c "SELECT ii.id AS item_id, ii.home_id AS item_home, l.id AS location_id, l.home_id AS location_home, l.name FROM public.inventory_items ii JOIN public.locations l ON l.id = ii.location_id WHERE ii.location_id IS NOT NULL AND ii.home_id <> l.home_id ORDER BY ii.id LIMIT 100;"

# Locations present for a home
psql $env:DATABASE_URL -c "SELECT id, home_id, name FROM public.locations WHERE home_id=3 ORDER BY id LIMIT 50;"
```

## Optional: tighten GRANTs to app_role

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "REVOKE ALL ON public.locations, public.skus, public.inventory_items FROM PUBLIC; GRANT SELECT, INSERT, UPDATE ON public.locations, public.skus, public.inventory_items TO app_role;"
```

## Disable/enable RLS temporarily

```powershell
psql $env:DATABASE_URL -c "ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;"
psql $env:DATABASE_URL -c "ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;"
```
