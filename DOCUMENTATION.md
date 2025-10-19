# 📚 RZ_SERVER DOCUMENTATION

## Quick Navigation

### 🎯 Getting Started
- **`drizzle/shared/INDEX.md`** - Documentation index and navigation guide
- **`drizzle/shared/QUICK_START.md`** - Most common commands and tasks

### 🔄 Schema & Validation
- **`drizzle/shared/SYNC_WORKFLOW.md`** - ⭐ **START HERE** for schema changes
- **`drizzle/shared/README.md`** - Schema naming and validation reference
- **`drizzle/shared/ARCHITECTURE.md`** - System design and patterns

### 🛠️ Scripts & Tools
- **`drizzle/shared/AVAILABLE_SCRIPTS.md`** - All available commands

### 🔐 Server Documentation
- **`server/docs/AUTO_INJECT_IMPLEMENTATION.md`** - Auto-injection middleware
- **`server/docs/rls-setup-cheatsheet.md`** - Row-level security setup
- **`server/docs/operational-playbook.md`** - Operations guide

---

## Essential Workflows

### 1. Schema Change (Most Common)
```powershell
# Edit: drizzle/shared/src/schema.ts
cd drizzle/shared
npm run build
cd ../../server
npx drizzle-kit generate
npm run migrate
cd ../client
npm install
```
**Full details:** `drizzle/shared/SYNC_WORKFLOW.md`

### 2. Fresh Database Setup
```powershell
cd server
tsx scripts/drizzle/drizzle-rebuild.ts
tsx scripts/seed-data.ts
tsx scripts/db/fix-all-sequences.ts
tsx scripts/rls/apply-rls-v2.ts
```

### 3. Fix Authentication
```powershell
cd server
tsx scripts/auth/set-dev-password.ts <email> <password>
tsx scripts/auth/grant-dev-memberships.ts
```

---

## Package Structure

```
rz_server/
├── drizzle/
│   └── shared/              # @postgress/shared package
│       ├── src/
│       │   ├── schema.ts    # ⭐ Source of truth
│       │   ├── zod.ts       # Validation schemas
│       │   └── types/       # TypeScript types
│       └── [Documentation]  # Start with INDEX.md
├── server/
│   ├── src/                 # Express API
│   ├── scripts/             # Utility scripts
│   └── docs/                # Server documentation
└── [This file]
```

---

## Core Concepts

### Single Source of Truth
**`drizzle/shared/src/schema.ts`** defines:
- Database schema (Drizzle)
- TypeScript types (auto-generated)
- Zod validation (base, then extended with defaults)

### Auto-Injection
Server middleware automatically adds `customerId` and `homeId` from JWT token:
```typescript
router.post('/', authenticateToken, autoInjectMiddleware('products'), handler);
```

### Validation with Defaults
One schema per table, defaults built-in:
```typescript
import { productsValidationSchema } from '@postgress/shared/zod';
const validated = productsValidationSchema.parse(formData);
// Defaults auto-populate: isVisible, isActive, hasMediaAssets, kind
```

---

## Documentation Index

### Shared Package Docs (`drizzle/shared/`)
- `INDEX.md` - Navigation guide ⭐ **START HERE**
- `QUICK_START.md` - Daily commands
- `SYNC_WORKFLOW.md` - Schema sync process
- `AVAILABLE_SCRIPTS.md` - All commands
- `ARCHITECTURE.md` - System design
- `README.md` - Schema reference

### Server Docs (`server/docs/`)
- `AUTO_INJECT_IMPLEMENTATION.md` - Middleware details
- `rls-setup-cheatsheet.md` - RLS policies
- `operational-playbook.md` - Operations guide
- `table-dependencies.md` - Table relationships
- `TODOS.md` - Known issues

### Migration Docs
- `HARMONIZE_KIND_SUMMARY.md` - Kind field migration (pending)

---

## Quick Reference

### Most Used Commands
```powershell
# Build shared package
cd drizzle/shared
npm run build

# Generate migration
cd server
npx drizzle-kit generate

# Apply migrations
cd server
npm run migrate

# Sync to client
cd client
npm install

# Start dev server
cd server
npm run dev
```

### Most Used Imports
```typescript
// Validation
import { productsValidationSchema } from '@postgress/shared/zod';

// Schema (server only)
import { products } from '@postgress/shared/schema';

// Types
import type { Product } from '@postgress/shared/types';
```

---

## Emergency Contacts

### "Module not found"
→ `drizzle/shared/QUICK_START.md` → Emergency Fixes

### "Database out of sync"
→ `drizzle/shared/SYNC_WORKFLOW.md` → Common Pitfalls

### "RLS blocking queries"
→ `server/docs/rls-setup-cheatsheet.md`

### "Can't authenticate"
→ `drizzle/shared/AVAILABLE_SCRIPTS.md` → Authentication Helpers

---

## Development Principles

1. ✅ Always edit `schema.ts` first
2. ✅ Build shared package after changes
3. ✅ Generate migrations for production
4. ✅ One schema per table (with defaults)
5. ✅ Let middleware handle auth fields

---

**Ready to start?** → Open `drizzle/shared/INDEX.md`

**Need to sync?** → Open `drizzle/shared/SYNC_WORKFLOW.md`

**Need a command?** → Open `drizzle/shared/QUICK_START.md`
