# Database Backups

This folder stores JSON backups created by migration scripts.

## Auto-generated files:
- `products_backup_YYYY-MM-DD.json` - Full products table snapshot
- `skus_backup_YYYY-MM-DD.json` - Full SKUs table snapshot
- `backup_summary_YYYY-MM-DD.json` - Backup metadata

## Usage:
Backups are created automatically when you run:
```bash
npx tsx ../db/backup-before-migration.ts
```

## Restore from backup:
If you need to restore data from a backup, use the JSON files with a custom import script or manual SQL INSERT statements.

---

**Note**: These are safety backups. Your database still has transaction safety and rollback capability.
