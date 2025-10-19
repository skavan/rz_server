# ⚡ QUICK START CARD

## 📋 Most Common Tasks

### Schema Change → Full Sync
```powershell
# 1. Edit schema
# Edit drizzle/shared/src/schema.ts in your editor

# 2. Build & sync
cd drizzle/shared
npm run build
cd ../../server
npx drizzle-kit generate
npm run migrate
cd ../client
npm install
```

### Fresh Database Rebuild
```powershell
cd server
tsx scripts/drizzle/drizzle-rebuild.ts
tsx scripts/seed-data.ts
tsx scripts/db/fix-all-sequences.ts
tsx scripts/rls/apply-rls-v2.ts
```

### Fix User Authentication
```powershell
cd server
tsx scripts/auth/set-dev-password.ts admin@test.com Password123!
tsx scripts/auth/grant-dev-memberships.ts
```

---

## 📚 Documentation Index

| Doc | Purpose |
|-----|---------|
| **README.md** | Overview & principles |
| **SYNC_WORKFLOW.md** | ⭐ Step-by-step sync guide |
| **AVAILABLE_SCRIPTS.md** | All commands & scripts |
| **ARCHITECTURE.md** | System design & patterns |
| **QUICK_START.md** | This file |

---

## 🎯 Import Reference

```typescript
// Validation schemas (use everywhere!)
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

// Database schema (server-only)
import { products, skus, inventoryItems } from '@postgress/shared/schema';

// Types
import type { Product, Sku, InventoryItem } from '@postgress/shared/types';
```

---

## 🛠️ Essential Commands

| Task | Command | Location |
|------|---------|----------|
| Build shared | `npm run build` | `drizzle/shared/` |
| Generate migration | `npx drizzle-kit generate` | `server/` |
| Apply migration | `npm run migrate` | `server/` |
| Check DB status | `npx drizzle-kit check` | `server/` |
| Test schemas | `node test-schemas.js` | `drizzle/shared/` |
| Seed data | `tsx scripts/seed-data.ts` | `server/` |
| Start server | `npm run dev` | `server/` |

---

## ⚠️ Critical Rules

1. **NEVER** edit database schema directly
2. **ALWAYS** build shared package after schema changes
3. **ALWAYS** generate migrations for production
4. **NEVER** commit `dist/` folder
5. **ALWAYS** sync client after shared package updates

---

## 🔥 Emergency Fixes

### "Module not found" in client
```powershell
cd client
Remove-Item -Recurse -Force node_modules/@postgress/shared
npm install
```

### Database out of sync
```powershell
cd server
npx drizzle-kit push  # ⚠️ Dev only!
```

### Sequences broken after import
```powershell
cd server
tsx scripts/db/fix-all-sequences.ts
```

### RLS blocking everything
```powershell
cd server
tsx scripts/rls/check-rls.ts
# Then disable RLS on problematic table if needed
```

---

## 💡 Pro Tips

- Use `npx drizzle-kit push` for rapid prototyping (dev only)
- Use `npx drizzle-kit generate` for production-ready migrations
- Test schemas with `node test-schemas.js` before syncing to client
- Always verify JWT token has `customerId` and `homeId` for auto-inject
- Use `.extend()` to customize validation schemas per form

---

## 🎓 Learning Path

1. Read **SYNC_WORKFLOW.md** (5 min)
2. Try a schema change end-to-end (15 min)
3. Read **ARCHITECTURE.md** (10 min)
4. Browse **AVAILABLE_SCRIPTS.md** as needed

---

**Need help?** Check the full docs in `drizzle/shared/` folder.
