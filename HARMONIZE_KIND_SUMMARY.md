# Harmonize BOM Field Migration Summary

**Date**: October 18, 2025  
**Goal**: Standardize BOM/Kit indicator across `products` and `skus` tables using `kind` field with values `'simple'` | `'bom'`

## Changes Overview

### 1. Database Schema Changes

#### Products Table
- **Before**: `isKit: boolean('is_kit').default(false)`
- **After**: `kind: varchar('kind', { length: 20 }).default('simple').$type<'simple' | 'bom'>()`
- **Index**: Renamed `idx_products_kit` → `idx_products_kind`

#### SKUs Table
- **Before**: `kind: varchar('kind').$type<'simple' | 'kit'>()`
- **After**: `kind: varchar('kind').$type<'simple' | 'bom'>()`
- **Note**: Only enum value changed, column structure unchanged

### 2. Migration Script
**File**: `drizzle/shared/migrations/0001_harmonize_kind_field.sql`

```sql
-- Products: Add kind column
ALTER TABLE products ADD COLUMN kind VARCHAR(20) DEFAULT 'simple' NOT NULL;

-- Migrate data: isKit=true → kind='bom'
UPDATE products SET kind = 'bom' WHERE is_kit = true;

-- Drop old column and index
ALTER TABLE products DROP COLUMN is_kit;
DROP INDEX IF EXISTS idx_products_kit;
CREATE INDEX idx_products_kind ON products(kind);

-- SKUs: Update enum values
UPDATE skus SET kind = 'bom' WHERE kind = 'kit';
```

### 3. TypeScript Schema Updates
**File**: `drizzle/shared/src/schema.ts`

✅ Products table: Changed to `kind` field  
✅ SKUs table: Updated type to `'simple' | 'bom'`  
✅ Inferred types automatically updated via Drizzle  

### 4. Seed Data Updates

#### Products JSON (`15-products.json`)
- Removed all `"is_kit": false` entries (default to `'simple'`)
- Changed `"is_kit": true` → `"kind": "bom"` (5 products)

#### SKUs JSON (`12-skus.json`)
- Changed all `"kind": "kit"` → `"kind": "bom"` (5 SKUs)

#### Seed Script (`seed-data.ts`)
- Updated product definitions: `isKit: true/false` → `kind: 'bom'/'simple'`
- Updated inventory creation logic: `isKit` → `isBom`
- Updated log messages: "KIT" → "BOM"

### 5. Route Updates
**File**: `server/src/routes/products.ts`

✅ POST route: Changed `isKit` → `kind`  
✅ PUT route: Changed `isKit` → `kind`  
✅ Bulk create/update: Changed `isKit` → `kind`  
✅ Auto-detection: `kind: components.length > 0 ? 'bom' : 'simple'`  

### 6. Build Verification
```bash
cd drizzle/shared
npm run build
# ✅ Build successful, no TypeScript errors
```

## Migration Steps for Production

### Option 1: Run Migration Manually
```bash
psql -U postgres -d your_database -f drizzle/shared/migrations/0001_harmonize_kind_field.sql
```

### Option 2: Use Drizzle Migration Tool
```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
await migrate(db, { migrationsFolder: './drizzle/shared/migrations' });
```

## Rollback Plan (if needed)

```sql
-- Rollback: Add back is_kit column
ALTER TABLE products ADD COLUMN is_kit BOOLEAN DEFAULT false;
UPDATE products SET is_kit = true WHERE kind = 'bom';
ALTER TABLE products DROP COLUMN kind;
CREATE INDEX idx_products_kit ON products(is_kit);

-- Rollback SKUs
UPDATE skus SET kind = 'kit' WHERE kind = 'bom';
```

## Testing Checklist

- [ ] Run migration on development database
- [ ] Verify `products` table has `kind` column
- [ ] Verify `products.is_kit` column is dropped
- [ ] Verify index `idx_products_kind` exists
- [ ] Verify SKUs with `kind='bom'` exist
- [ ] Test POST `/api/products` with `kind: 'bom'`
- [ ] Test POST `/api/products` with auto-detection (components array)
- [ ] Test PUT `/api/products/:id` updating `kind`
- [ ] Run seed script to verify new data format
- [ ] Update client forms to use `kind` field

## Files Modified

### Schema & Migrations
- ✅ `drizzle/shared/src/schema.ts`
- ✅ `drizzle/shared/migrations/0001_harmonize_kind_field.sql` (new)

### Seed Data
- ✅ `server/scripts/drizzle/seed-data/15-products.json`
- ✅ `server/scripts/drizzle/seed-data/12-skus.json`
- ✅ `server/scripts/seed-data.ts`

### Routes
- ✅ `server/src/routes/products.ts`

### Build Output
- ✅ `drizzle/shared/dist/**` (rebuilt)

## Notes

- **Inventory items**: `isKitComponent` field remains unchanged (different concept)
- **Backward compatibility**: Breaking change - clients must update to use `kind` field
- **Default value**: Products without explicit `kind` will default to `'simple'`
- **Auto-detection**: Server can auto-set `kind='bom'` when components array is provided
- **Extensibility**: `kind` field can support future values like `'variant'`, `'bundle'`, etc.

## Next Steps

1. Apply migration to development database
2. Test all product CRUD operations
3. Update client-side forms to use `kind` field
4. Update API documentation
5. Plan production migration window
6. Communicate breaking change to team
