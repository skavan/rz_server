# 🔄 SYNC WORKFLOW: Server & Client

## The Golden Rule

**NEVER edit client schemas directly!** All schema changes happen in `drizzle/shared/src/schema.ts`

## 🎯 Complete Sync Process

### Step 1: Make Schema Changes

Edit the source of truth:
```
drizzle/shared/src/schema.ts
```

**Example:** Add a new field
```typescript
export const products = pgTable('products', {
  // ... existing fields
  newField: text('new_field'),
});
```

---

### Step 2: Rebuild Shared Package

```powershell
cd drizzle/shared
npm run build
```

**What this does:**
- Compiles TypeScript → JavaScript (to `dist/`)
- Generates types
- Builds Zod validation schemas

**Output:** `drizzle/shared/dist/` folder with compiled code

---

### Step 3: Update Database Schema

**Option A: Generate Migration (Recommended)**
```powershell
cd ../../server
npx drizzle-kit generate
```

This creates a migration file in `server/drizzle/` folder.

**Option B: Push Directly (Dev Only)**
```powershell
cd ../../server
npx drizzle-kit push
```

This pushes schema changes directly to DB (no migration file).

---

### Step 4: Apply Migration to Database

```powershell
cd server
npm run migrate
```

Or run the migration script directly:
```powershell
cd server
tsx scripts/drizzle/apply-migrations.ts
```

---

### Step 5: Sync to Client

The `@skavan/rentalzen-drizzle` package is linked via npm workspace or local file reference.

**For npm workspace:**
```powershell
# From repo root
npm install
```

**For client with local dependency:**
```json
// client/package.json
{
  "dependencies": {
    "@skavan/rentalzen-drizzle": "file:../drizzle/shared"
  }
}
```

```powershell
cd client
npm install
```

---

### Step 6: Update Client Imports (If Needed)

If you added new schemas or changed names:

```typescript
// client/src/lib/validation.ts
import { 
  productsValidationSchema,
  newTableValidationSchema  // ← New import
} from '@skavan/rentalzen-drizzle/zod';
```

---

## 🚀 Quick Sync Cheatsheet

**After schema changes:**
```powershell
# 1. Build shared package
cd drizzle/shared
npm run build

# 2. Generate & apply migration
cd ../../server
npx drizzle-kit generate
npm run migrate

# 3. Sync to client (if using file: reference)
cd ../client
npm install
```

---

## 🔍 Verify Sync Status

**Check shared package built:**
```powershell
cd drizzle/shared
Get-ChildItem dist/  # Should see schema.js, zod.js, types folder
```

**Check database schema matches:**
```powershell
cd server
npx drizzle-kit check
```

**Check client has latest:**
```powershell
cd client
Get-Content node_modules/@skavan/rentalzen-drizzle/package.json  # Check version
```

---

## ⚠️ Common Pitfalls

### 1. "Module not found" in client
**Cause:** Client's `node_modules/@skavan/rentalzen-drizzle` is stale

**Fix:**
```powershell
cd client
Remove-Item -Recurse -Force node_modules/@skavan/rentalzen-drizzle
npm install
```

### 2. Schema changes don't appear in client
**Cause:** Forgot to rebuild shared package

**Fix:**
```powershell
cd drizzle/shared
npm run build
cd ../../client
npm install
```

### 3. Database out of sync with schema
**Cause:** Generated migration but didn't apply it

**Fix:**
```powershell
cd server
npm run migrate
```

### 4. TypeScript errors about missing fields
**Cause:** Database has new fields but client doesn't see them

**Fix:** Follow full sync process (Steps 1-6)

---

## 🎓 Understanding the Flow

```
┌─────────────────────────────────────────────────────────────┐
│  drizzle/shared/src/schema.ts (SOURCE OF TRUTH)            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │  npm run build      │
              └─────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  dist/schema.js     │         │  dist/zod.js        │
│  dist/types/        │         │  (with defaults)    │
└─────────────────────┘         └─────────────────────┘
          │                               │
          ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  SERVER             │         │  CLIENT             │
│  ├─ migrations      │         │  ├─ forms           │
│  ├─ db queries      │         │  ├─ validation      │
│  └─ API routes      │         │  └─ types           │
└─────────────────────┘         └─────────────────────┘
```

---

## 📝 Real-World Example

**Scenario:** Add `priority` field to products table

```typescript
// 1. Edit drizzle/shared/src/schema.ts
export const products = pgTable('products', {
  // ... existing
  priority: integer('priority').default(0),
});

// 2. Edit drizzle/shared/src/zod.ts
export const productsValidationSchema = createValidationSchema(products).extend({
  // ... existing defaults
  priority: z.number().default(0),
});
```

```powershell
# 3. Build
cd drizzle/shared
npm run build

# 4. Generate migration
cd ../../server
npx drizzle-kit generate
# Creates: server/drizzle/0001_add_priority_to_products.sql

# 5. Apply migration
npm run migrate

# 6. Sync to client
cd ../client
npm install

# 7. Use in client
# The priority field is now available with default value of 0!
```

---

## 🎯 Summary

1. **Edit:** `drizzle/shared/src/schema.ts` (and optionally `zod.ts`)
2. **Build:** `cd drizzle/shared && npm run build`
3. **Migrate:** `cd server && npx drizzle-kit generate && npm run migrate`
4. **Sync:** `cd client && npm install`
5. **Use:** Import schemas in client code

**Remember:** Always build shared package first, then sync to server and client!
