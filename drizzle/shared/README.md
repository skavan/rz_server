# 📚 SHARED PACKAGE CODEX

## What This Is

The `@postgress/shared` package contains:
- **Drizzle schema** (single source of truth)
- **Zod validation schemas** (with sensible defaults built-in)
- **TypeScript types** (auto-generated from schema)

## Quick Reference

### 1. Sync Workflow (Critical!)

**See: `SYNC_WORKFLOW.md`** - Step-by-step guide to sync changes between server and client

### 2. Schema Naming Convention

**One schema per table, with defaults built-in:**

```typescript
import {
  productsValidationSchema,
  skusValidationSchema,
  inventoryItemsValidationSchema,
  locationsValidationSchema,
  categoriesValidationSchema,
  brandsValidationSchema,
  vendorsValidationSchema,
  homesValidationSchema,
  tagsValidationSchema,
} from '@postgress/shared/zod';
```

**Pattern:** Table name (plural) + `ValidationSchema`

### 3. How to Use Schemas

```typescript
// Basic usage - defaults auto-populate
const validated = productsValidationSchema.parse(formData);

// Extend for custom validation
const formSchema = productsValidationSchema.extend({
  name: z.string().min(1, "Required"),
  categoryId: z.number().positive("Required"),
});
```

### 4. Default Values by Table

| Table | Defaults |
|-------|----------|
| products | `isVisible: true, isActive: true, hasMediaAssets: false, kind: 'simple'` |
| skus | `hasMediaAssets: false, kind: 'simple', status: 'active'` |
| inventoryItems | `isActive: true, hasMediaAssets: false, isKitComponent: false, quantity: 1, status: 'unassigned', condition: 'good', currency: 'USD'` |
| locations | `isActive: true` |
| categories | `isActive: true` |
| brands | `isActive: true` |
| vendors | `isActive: true` |
| homes | `isActive: true` |
| tags | `isActive: true, isSystem: false, locked: false` |

### 5. Field Harmonization (`kind` field)

**Products & SKUs now use `kind` field:**
- Values: `'simple'` | `'bom'`
- Default: `'simple'`
- Replaces old: `isKit`, `isBom`, `is_kit`, `is_bom`

**Migration pending** - see `../../../HARMONIZE_KIND_SUMMARY.md`

### 6. Available Helper Scripts

See: `AVAILABLE_SCRIPTS.md` for full list of build/migration/utility scripts

---

## File Structure

```
drizzle/shared/
├── src/
│   ├── schema.ts          # Database schema (source of truth)
│   ├── zod.ts             # Validation schemas with defaults
│   ├── client.ts          # Client-safe exports
│   └── types/             # TypeScript type definitions
├── dist/                  # Compiled output (git-ignored)
├── package.json
└── [This Codex]
```

---

## Core Principles

1. **One Schema Per Table** - No base/insert variants, defaults built-in
2. **Plural Table Names** - `products`, `skus`, `inventoryItems`
3. **Defaults Override** - Form data overrides defaults automatically
4. **Extensible** - Use `.extend()` for custom validation

---

## Next Steps

1. Read `SYNC_WORKFLOW.md` - Learn how to sync changes
2. Read `AVAILABLE_SCRIPTS.md` - Understand available tools
3. Read `ARCHITECTURE.md` - Understand the system design

