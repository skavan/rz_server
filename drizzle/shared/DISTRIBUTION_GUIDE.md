# 📦 DRIZZLE-SHARED DISTRIBUTION GUIDE

## Overview

The `@skavan/rentalzen-drizzle` package is the **single source of truth** for:
- Database schema (Drizzle ORM)
- TypeScript types
- Zod validation schemas
- Shared utilities

This package is consumed by:
- **rz_server** (this repo) - Express API server
- **declarative-client** (separate repo) - Next.js frontend

---

## 🎯 Complete Distribution Workflow

### Step 1: Make Schema Changes

Edit the source of truth:
```
drizzle/shared/src/schema.ts
```

**Convention:**
- Database columns: `snake_case`
- Drizzle properties: `camelCase` mapped to snake_case columns
- Example: `firstName: varchar('first_name', { length: 255 })`

### Step 2: Rebuild Shared Package

```powershell
cd drizzle/shared
npm run build
```

**What this does:**
- Compiles TypeScript → JavaScript
- Generates type definitions
- Creates Zod validation schemas
- Outputs to `dist/` folder

**Verify build:**
```powershell
Get-ChildItem dist/
# Should see: schema.js, zod.js, types/, etc.
```

---

### Step 3: Update Server (rz_server)

#### A. Generate Migration

```powershell
cd ../../server
npx drizzle-kit generate
```

This creates a migration file in `server/drizzle/` folder.

#### B. Apply Migration

```powershell
npm run migrate
```

Or manually:
```powershell
tsx scripts/drizzle/apply-migrations.ts
```

#### C. Verify Database

```powershell
npx drizzle-kit check
```

**Optional: Rebuild entire database (⚠️ Destructive)**
```powershell
cd server
tsx scripts/drizzle/drizzle-rebuild.ts
tsx scripts/seed-data.ts
tsx scripts/db/fix-all-sequences.ts
tsx scripts/rls/apply-rls-v2.ts
```

---

### Step 4: Update Client (declarative-client)

#### Navigate to Client Repo

```powershell
cd /path/to/declarative-client
```

#### Force Reinstall Shared Package

```powershell
pnpm install --force
```

**Why `--force`?**
- Client uses local file reference: `"@skavan/rentalzen-drizzle": "file:../rz_server/drizzle/shared"`
- `--force` ensures pnpm picks up the rebuilt package
- Without it, pnpm may use cached version

#### Verify Package Updated

```powershell
# Check package.json references
Get-Content package.json | Select-String "@skavan/rentalzen-drizzle"

# Check installed version
Get-Content node_modules/@skavan/rentalzen-drizzle/package.json
```

#### Rebuild Client

```powershell
pnpm run build
```

Or for development:
```powershell
pnpm run dev
```

---

## 🔄 Quick Reference: Full Sync

**After editing `drizzle/shared/src/schema.ts`:**

```powershell
# 1. Build shared package
cd drizzle/shared
npm run build

# 2. Update server database
cd ../../server
npx drizzle-kit generate
npm run migrate

# 3. Update declarative-client
cd /path/to/declarative-client
pnpm install --force
pnpm run dev
```

---

## 📋 Verification Checklist

### ✅ After Building Shared Package
- [ ] `drizzle/shared/dist/` folder exists
- [ ] `dist/schema.js` contains your changes
- [ ] `dist/zod.js` has updated validation schemas
- [ ] No TypeScript errors in build output

### ✅ After Updating Server
- [ ] Migration file created in `server/drizzle/`
- [ ] Migration applied successfully
- [ ] `npx drizzle-kit check` shows no issues
- [ ] Server starts without errors

### ✅ After Updating Client
- [ ] `pnpm install --force` completed
- [ ] `node_modules/@skavan/rentalzen-drizzle/` has new package
- [ ] Client builds without TypeScript errors
- [ ] New fields/schemas available in forms

---

## 🔍 Field Mapping Verification

### Verify No Snake_Case Drift

From server directory, run the mapping scanner:

```powershell
cd server
npm run dev:scan-mappings                 # Scan all tables
npm run dev:scan-mappings -- customers    # Scan specific table
npm run dev:scan-mappings -- products,skus,inventory_items
```

**Expected output:**
```
✅ db_column -> camelCaseProp
✅ No missing columns
```

**If you see snake_case props:**
1. Fix property names in `drizzle/shared/src/schema.ts`
2. Rebuild: `cd drizzle/shared && npm run build`
3. Re-verify mappings

---

## 🎓 Understanding Package Linking

### How Client Consumes Shared Package

**declarative-client/package.json:**
```json
{
  "dependencies": {
    "@skavan/rentalzen-drizzle": "file:../rz_server/drizzle/shared"
  }
}
```

**What this means:**
- Client references the **local file system** copy
- Changes to `rz_server/drizzle/shared` affect client
- Must rebuild shared package BEFORE syncing to client
- Must use `pnpm install --force` to pick up changes

### Alternative: Publishing to npm Registry

**If you want to publish to private npm registry:**

```powershell
# In drizzle/shared/
npm version patch
npm publish
```

Then in client:
```powershell
pnpm update @skavan/rentalzen-drizzle
```

**Current setup uses file reference, not published package.**

---

## 🚨 Common Issues

### "Module not found @skavan/rentalzen-drizzle"

**Cause:** Client's node_modules is stale

**Fix:**
```powershell
cd /path/to/declarative-client
Remove-Item -Recurse -Force node_modules/@skavan/rentalzen-drizzle
pnpm install --force
```

### "Type error: Property X does not exist"

**Cause:** Shared package not rebuilt after schema change

**Fix:**
```powershell
cd /path/to/rz_server/drizzle/shared
npm run build
cd /path/to/declarative-client
pnpm install --force
```

### Client shows old schema

**Cause:** pnpm cached old version

**Fix:**
```powershell
cd /path/to/declarative-client
pnpm store prune
pnpm install --force
```

### Database schema doesn't match code

**Cause:** Migration generated but not applied

**Fix:**
```powershell
cd /path/to/rz_server/server
npm run migrate
```

---

## 🎯 Real-World Example

**Scenario:** Add `priority` field to products table

### 1. Edit Schema
```typescript
// drizzle/shared/src/schema.ts
export const products = pgTable('products', {
  // ... existing fields
  priority: integer('priority').default(0),
});
```

### 2. Update Zod Schema (Optional)
```typescript
// drizzle/shared/src/zod.ts
export const productsValidationSchema = createValidationSchema(products).extend({
  // ... existing defaults
  priority: z.number().default(0),
});
```

### 3. Build & Distribute
```powershell
# Build shared package
cd /path/to/rz_server/drizzle/shared
npm run build

# Update server
cd ../../server
npx drizzle-kit generate
# Creates: server/drizzle/0001_add_priority_to_products.sql
npm run migrate

# Update client
cd /path/to/declarative-client
pnpm install --force

# Verify in client
pnpm run dev
# Now ProductForm can use priority field with default value 0!
```

---

## 📊 Package Structure

```
drizzle/shared/
├── src/
│   ├── schema.ts           # ⭐ Source of truth
│   ├── zod.ts              # Validation schemas
│   ├── client.ts           # Client-safe exports
│   ├── server-only.ts      # Server-only exports
│   └── types/              # TypeScript types
├── dist/                   # Compiled output (git-ignored)
├── package.json            # Package metadata
└── tsconfig.json           # TypeScript config
```

**Key Files:**
- `schema.ts` - Database schema definition
- `zod.ts` - Validation with defaults
- `client.ts` - What client can import
- `server-only.ts` - DB connection, server utilities

---

## 🔐 Security Note

**Client should NEVER import:**
- Database connection objects
- Server-only utilities
- Raw SQL queries

**Use `client.ts` exports only:**
```typescript
// ✅ Good (client)
import { productsValidationSchema } from '@skavan/rentalzen-drizzle/zod';
import type { Product } from '@skavan/rentalzen-drizzle/types';

// ❌ Bad (client)
import { db } from '@skavan/rentalzen-drizzle/server-only'; // Don't do this!
```

---

## 📝 Conventions Reminder

### Database Columns
- Format: `snake_case`
- Example: `first_name`, `created_at`, `is_active`

### Drizzle Properties
- Format: `camelCase`
- Mapped to snake_case columns
- Example: `firstName`, `createdAt`, `isActive`

### API Shape (Server)
- Always returns: `camelCase`
- Auto-transformed by middleware
- Client expects: `camelCase` exclusively

### Migration Files
- Location: `server/drizzle/`
- Format: `NNNN_description.sql`
- Applied in order by timestamp

---

## 🎯 Summary

**Edit Once:**
```
drizzle/shared/src/schema.ts
```

**Build Once:**
```powershell
cd drizzle/shared
npm run build
```

**Distribute Twice:**
```powershell
# Server
cd server
npx drizzle-kit generate && npm run migrate

# Client
cd /path/to/declarative-client
pnpm install --force
```

**Result:**
- Server has new schema in database
- Client has new types and validation
- Both stay in perfect sync

---

## 📚 Related Documentation

- **SYNC_WORKFLOW.md** - Detailed sync process
- **ARCHITECTURE.md** - System design overview
- **QUICK_START.md** - Daily commands
- **drizzle/README.md** - Drizzle conventions

---

**Last Updated:** October 18, 2025  
**Package Version:** Check `drizzle/shared/package.json`
