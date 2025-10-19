# Database Migration Scripts

This folder contains safe, transaction-wrapped database migration scripts.

## 📂 Files

### Migration Scripts
- **`run-kind-migration.ts`** - Main migration script (harmonize isKit → kind)
- **`backup-before-migration.ts`** - Create JSON backups before migration
- **`verify-migration.ts`** - Verify migration completed successfully

### Documentation
- **`QUICK_START.md`** - Fast migration guide (3 commands)
- **`MIGRATION_GUIDE.md`** - Detailed migration documentation

## 🚀 Quick Start

```bash
# 1. Backup
npx tsx backup-before-migration.ts

# 2. Migrate
npx tsx run-kind-migration.ts

# 3. Verify
npx tsx verify-migration.ts
```

## 🛡️ Safety Features

All migration scripts include:
- ✅ **Transaction safety** - Auto-rollback on error
- ✅ **Data verification** - Checks integrity before commit
- ✅ **Backup support** - JSON exports of affected tables
- ✅ **Detailed logging** - Shows every step and result
- ✅ **Zero data loss** - Additive first, then remove old

## 📖 Documentation

See **`MIGRATION_GUIDE.md`** for:
- Step-by-step instructions
- Technical details
- Rollback procedures
- Troubleshooting guide

See **`QUICK_START.md`** for:
- Quick reference commands
- Success indicators
- Common errors and fixes

## 🎯 Current Migration: Harmonize `kind` Field

**Goal**: Standardize BOM/Kit indicator across products and SKUs

**Changes**:
- Products: `isKit: boolean` → `kind: 'simple' | 'bom'`
- SKUs: `kind: 'kit'` → `kind: 'bom'`

**Data Migration**:
- `isKit=true` → `kind='bom'` (5 products)
- `isKit=false` → `kind='simple'` (16 products)
- SKU `kind='kit'` → `kind='bom'` (5 SKUs)

**Downtime**: < 1 second  
**Reversible**: Yes (rollback script in guide)

---

For questions or issues, see `MIGRATION_GUIDE.md` troubleshooting section.
