# 📚 SHARED PACKAGE DOCUMENTATION

## Start Here 👇

### 🚀 **QUICK_START.md** - Read This First!
**5 minutes** - Most common tasks, essential commands, emergency fixes

---

## Core Documentation (Read in Order)

### 1️⃣ **DISTRIBUTION_GUIDE.md** ⭐ MOST IMPORTANT
**Complete distribution guide:** How to manage and distribute drizzle-shared to server AND declarative-client

**Use this when:**
- Syncing changes to declarative-client
- Client says "module not found"
- Need complete end-to-end workflow
- Understanding package linking

### 2️⃣ **SYNC_WORKFLOW.md**
**Step-by-step guide:** How to sync schema changes (server focus)

**Use this when:**
- Adding/modifying database fields
- Creating new tables
- Updating Zod schemas

### 3️⃣ **AVAILABLE_SCRIPTS.md**
**Complete command reference:** All scripts and what they do

### 🆕 **PUBLISH_WORKFLOW.md**
**Release and registry guide:** How to version and publish `@skavan/rentalzen-drizzle` for downstream clients

**Use this when:**
- Need to rebuild database
- Fix sequences after data import
- Apply RLS policies
- Test validation schemas

### 4️⃣ **ARCHITECTURE.md**
**System design:** How everything fits together

**Use this when:**
- Understanding data flow
- Learning security model
- Adding new features
- Troubleshooting weird issues

### 5️⃣ **README.md**
**Package overview:** Quick reference for schema naming and defaults

---

## Document Summary

| File | Pages | Purpose | When to Read |
|------|-------|---------|--------------|
| **QUICK_START.md** | 1 | Cheat sheet | Every day |
| **DISTRIBUTION_GUIDE.md** | 5 | Full distribution to server & client | After schema changes |
| **SYNC_WORKFLOW.md** | 3 | Server sync process | Server-only changes |
| **AVAILABLE_SCRIPTS.md** | 3 | Command reference | When you need a script |
| **PUBLISH_WORKFLOW.md** | 2 | Publish + release flow | When releasing shared package |
| **ARCHITECTURE.md** | 4 | System design | Learning/troubleshooting |
| **README.md** | 2 | Quick reference | Schema info lookup |

**Total:** ~18 pages (focused and actionable!)

---

## Quick Navigation

### I need to...

**...sync to declarative-client**
→ `DISTRIBUTION_GUIDE.md` ⭐

**...sync schema change (server only)**
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
} from '@skavan/rentalzen-drizzle/zod';
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
