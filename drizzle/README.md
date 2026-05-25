## Drizzle as the Source of Truth

This repo treats Drizzle schema definitions as the single source of truth for the database. You change one place, rebuild once, and everything else follows.

### Conventions

- Database columns: snake_case
- Drizzle property names: camelCase mapped to snake_case columns (e.g., `firstName: varchar('first_name', …)`).
- Server API shape: camelCase always. A safety transform camelCases any stray fields; enable logs with `FIELD_TRANSFORM_DEBUG=true`.
- Client expects camelCase exclusively.

### Where to edit

- Edit schema only in: `drizzle/shared/src/schema.ts`
- Then rebuild the shared package so dependents get the updated types and metadata.

PowerShell:

```powershell
cd .\drizzle\shared
npm run build
```
Head over to client and force a pnpm install
```
cd ../declarative-client
pnpm install --force
```

### Generate SQL/migrations from Drizzle

Drizzle SQL is generated when needed by scripts. If you want to generate manually:

```powershell
cd .\drizzle\shared
npx drizzle-kit generate
```

### Verify mappings (no drift, no snake props)

From `server_v2`, run the mapping scanner. It compares Drizzle tables vs information_schema and warns if any props remain snake_case.

```powershell
cd .\server_v2
npm run dev:scan-mappings                 # scan all tables
npm run dev:scan-mappings -- customers    # scan specific tables
npm run dev:scan-mappings -- products,skus,inventory_items
```

Expected output shows `db_column -> camelCaseProp` and “No missing columns.” If it lists snake_case props, rename those property keys in Drizzle and rebuild shared.

### Rebuild database objects from Drizzle SQL

We use drizzle-kit SQL emitted from `drizzle/shared`.

- Bulk inventory v2 (drop → create → seed):

```powershell
cd .\server_v2
npm run db:rebuild:inventory
```

- Single-table tool (drop/create/seed) is available at `server_v2/scripts/drizzle/drizzle-rebuild.ts` and auto-ensures enum types idempotently before creating dependent tables.

### End-to-end workflow

1) Edit schema once in `drizzle/shared/src/schema.ts` (camelCase props → snake columns)
2) Build shared: `cd .\drizzle\shared; npm run build`
3) (Optional) Regenerate SQL: `npx drizzle-kit generate`
4) Rebuild DB (as needed): `cd .\server_v2; npm run db:migrate` or `npm run db:rebuild:inventory`
5) Verify: `npm run dev:scan-mappings`

### Notes

- Inventory v2 tables (products, skus, inventory_items, locations, media_assets) are fully camelCase-mapped and in sync.
- NextAuth tables (accounts, sessions, verification_tokens) exist; token fields in `accounts` are camelCased and mapped to snake columns.
- The server transform guarantees camelCase in responses even if a new column starts as snake_case—use the scanner to remove such fallbacks quickly.


### Table List
accounts
brands
categories
customers
homes
inventory_items
locations
media_assets
product_components
products
sessions
sku_components
skus
tags
user_home_access
user_invites
users
vendors
verification_tokens
