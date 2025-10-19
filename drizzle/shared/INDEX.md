# 📚 SHARED PACKAGE DOCUMENTATION

## Start Here 👇

### 🚀 **QUICK_START.md** - Read This First!
**5 minutes** - Most common tasks, essential commands, emergency fixes

---

## Core Documentation (Read in Order)

### 1️⃣ **SYNC_WORKFLOW.md** ⭐ MOST IMPORTANT
**Step-by-step guide:** How to sync schema changes between server and client

**Use this when:**
- Adding/modifying database fields
- Creating new tables
- Updating Zod schemas
- Client says "module not found"

### 2️⃣ **AVAILABLE_SCRIPTS.md**
**Complete command reference:** All scripts and what they do

**Use this when:**
- Need to rebuild database
- Fix sequences after data import
- Apply RLS policies
- Test validation schemas

### 3️⃣ **ARCHITECTURE.md**
**System design:** How everything fits together

**Use this when:**
- Understanding data flow
- Learning security model
- Adding new features
- Troubleshooting weird issues

### 4️⃣ **README.md**
**Package overview:** Quick reference for schema naming and defaults

---

## Document Summary

| File | Pages | Purpose | When to Read |
|------|-------|---------|--------------|
| **QUICK_START.md** | 1 | Cheat sheet | Every day |
| **SYNC_WORKFLOW.md** | 3 | Sync process | After schema changes |
| **AVAILABLE_SCRIPTS.md** | 3 | Command reference | When you need a script |
| **ARCHITECTURE.md** | 4 | System design | Learning/troubleshooting |
| **README.md** | 2 | Quick reference | Schema info lookup |

**Total:** ~13 pages (vs 26+ before!)

---

## Quick Navigation

### I need to...

**...sync a schema change**
→ `SYNC_WORKFLOW.md`

**...rebuild the database**
→ `AVAILABLE_SCRIPTS.md` → "Database Management"

**...understand how validation works**
→ `ARCHITECTURE.md` → "Validation with Defaults"

**...see all available schemas**
→ `README.md` → "Schema Naming Convention"

**...fix a broken sync**
→ `QUICK_START.md` → "Emergency Fixes"

**...add a new table**
→ `ARCHITECTURE.md` → "Adding a New Table"

---

## Visual Structure

```
┌─────────────────────────────────────────────────────────┐
│  START HERE: QUICK_START.md                            │
│  ⚡ Commands you'll use every day                      │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ SYNC_        │  │ AVAILABLE_   │  │ ARCHITECTURE │
│ WORKFLOW.md  │  │ SCRIPTS.md   │  │ .md          │
│              │  │              │  │              │
│ How to sync  │  │ All commands │  │ How it works │
└──────────────┘  └──────────────┘  └──────────────┘
                           │
                           ▼
                  ┌──────────────┐
                  │  README.md   │
                  │              │
                  │  Reference   │
                  └──────────────┘
```

---

## Print-Friendly Version

**Core Workflow (memorize this):**
```bash
# After editing drizzle/shared/src/schema.ts
cd drizzle/shared && npm run build
cd ../../server && npx drizzle-kit generate && npm run migrate
cd ../client && npm install
```

**Import Pattern:**
```typescript
import { 
  productsValidationSchema,
  skusValidationSchema,
  // ... other schemas
} from '@postgress/shared/zod';
```

**Key Principle:**
One schema per table, with defaults built-in. Extend with `.extend()` if needed.

---

## Deprecated Documents (Removed)

The following docs were consolidated:
- ❌ DEFAULTS_GUIDE.md → merged into README.md and ARCHITECTURE.md
- ❌ INSERT_SCHEMAS_GUIDE.md → merged into README.md
- ❌ SCHEMA_REALITY_CHECK.md → merged into ARCHITECTURE.md
- ❌ SCRIPTS_SUMMARY.md → replaced by AVAILABLE_SCRIPTS.md
- ❌ SCHEMA_NAMING.md → merged into README.md

---

## Contributing

When adding documentation:
1. Keep it concise (target: 2-3 pages max per doc)
2. Use examples, not theory
3. Include "when to use this" sections
4. Cross-reference other docs
5. Update this index

---

**Last Updated:** October 18, 2025
