# Quick Migration Commands

## 🚀 Safe Migration (3 Easy Steps)

### 1. Backup (30 seconds)
```bash
cd server/scripts/db
npx tsx backup-before-migration.ts
```

### 2. Migrate (< 1 second)
```bash
npx tsx run-kind-migration.ts
```

### 3. Verify (5 seconds)
```bash
npx tsx verify-migration.ts
```

---

## ✅ Success Indicators

After running migration, you should see:

```
✅ Migrated 5 products to kind='bom'
✅ Data verification passed - no mismatches
✅ Dropped is_kit column and index
✅ Created idx_products_kind
✅ Updated 5 SKUs
✅ Migration completed successfully!
```

After running verification:

```
✅ PASS: is_kit removed, kind exists
✅ PASS: All products have valid kind values
✅ PASS: Old index removed, new index exists
✅ PASS: All SKUs migrated from kit to bom
🎉 ALL CHECKS PASSED!
```

---

## 📁 Files Created

- `server/scripts/db/backup-before-migration.ts` - Creates JSON backups
- `server/scripts/db/run-kind-migration.ts` - Runs migration safely
- `server/scripts/db/verify-migration.ts` - Verifies success
- `server/scripts/db/MIGRATION_GUIDE.md` - Full documentation
- `server/scripts/backups/` - Backup directory (created automatically)

---

## 🆘 Quick Troubleshooting

**Error: "Cannot connect to database"**
→ Check `.env` file has correct `DATABASE_URL`

**Error: "is_kit column doesn't exist"**
→ Migration already completed! Run verify script.

**Error: "kind column already exists"**
→ Migration partially completed. Safe to re-run (it will skip existing).

**Want to rollback?**
→ See `MIGRATION_GUIDE.md` section "Rollback Plan"

---

## 📊 What Changes

### Database Schema
- Products: `is_kit` (boolean) → `kind` (varchar: 'simple' | 'bom')
- SKUs: `kind='kit'` → `kind='bom'`
- Index: `idx_products_kit` → `idx_products_kind`

### API Changes
- POST/PUT `/api/products`: Use `kind: 'simple'` or `kind: 'bom'`
- Response fields: `kind` instead of `isKit`

### Client Changes Needed
```typescript
// Before
const product = { name: "Kit", isKit: true };

// After
const product = { name: "Kit", kind: "bom" };
```

---

## 💡 Pro Tips

1. **Test in development first!** Run migration on dev database before production.
2. **Migration is transaction-safe** - Rolls back automatically on any error.
3. **Zero downtime** - Takes < 1 second, no locking issues.
4. **Backups are automatic** - But run backup script for extra safety.
5. **Verification is built-in** - Migration checks data before committing.

---

## 🎯 Next Steps After Migration

1. ✅ Restart server: `cd server && npm run dev`
2. ✅ Update client code to use `kind` field
3. ✅ Test creating/updating products with `kind='bom'`
4. ✅ Update API documentation
5. ✅ Celebrate! 🎉
