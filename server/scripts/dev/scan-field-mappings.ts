/**
 * Scan Drizzle table field mappings vs actual DB columns and print a report.
 *
 * Usage:
 *   npx tsx scripts/dev/scan-field-mappings.ts              # scan ALL tables
 *   npx tsx scripts/dev/scan-field-mappings.ts products     # single table by export name
 *   npx tsx scripts/dev/scan-field-mappings.ts products skus inventory_items  # multiple
 *   npx tsx scripts/dev/scan-field-mappings.ts skus products --verbose        # flags ok
 */
import { Pool } from 'pg';
import * as schemas from '@postgress/shared';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env from server_v2/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

function toCamelCase(s: string) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }

// Loosen type to avoid Drizzle internal type incompatibilities
type AnyTable = any;

async function main() {
  const args = process.argv.slice(2);
  const filters = new Set(
    args
      .filter(a => !a.startsWith('-'))
      .flatMap(a => a.split(',').map(s => s.trim()))
      .filter(Boolean)
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Gather Drizzle tables
    const tables: Array<{ exportName: string; dbName: string; table: AnyTable }> = [];
    for (const [name, obj] of Object.entries(schemas)) {
      if (obj && typeof obj === 'object' && (obj as any).constructor?.name === 'PgTable') {
        const dbName: string = (obj as any)[Symbol.for('drizzle:Name')] || (obj as any)[Symbol.for('drizzle:OriginalName')];
        const include = filters.size === 0 || filters.has(name) || filters.has(dbName);
        if (include) tables.push({ exportName: name, dbName, table: obj as any });
      }
    }

    if (tables.length === 0) {
      console.log('No matching tables. Available exports include:');
      const names = Object.entries(schemas)
        .filter(([, obj]) => obj && typeof obj === 'object' && (obj as any).constructor?.name === 'PgTable')
        .map(([name]) => name)
        .sort();
      console.log('  ' + names.join(', '));
      process.exit(2);
    }

    for (const { exportName, dbName, table } of tables) {
      const columns: Record<string, any> = (table as any)[Symbol.for('drizzle:Columns')] || {};
      const mapping = Object.fromEntries(Object.entries(columns).map(([prop, col]: any) => [col.name, prop]));

      // Fetch actual DB columns
      const res = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [dbName]
      );
      const dbCols = res.rows.map(r => r.column_name as string);

      // Report
      console.log(`\nTable: ${exportName} (db: ${dbName})`);
      console.log(`Mapped columns (${Object.keys(mapping).length}):`);
      for (const [snake, camel] of Object.entries(mapping)) {
        console.log(`  ${snake} -> ${camel}`);
      }

      const missing = dbCols.filter(c => !(c in mapping));
      if (missing.length) {
        console.log(`\n  Missing in Drizzle mapping (${missing.length}):`);
        for (const c of missing) console.log(`  - ${c} -> ${toCamelCase(c)}`);
      } else {
        console.log('\n  No missing columns.');
      }

      // Warn on snake_case property names (fragile for API clients expecting camelCase)
      const snakeProps = Object.entries(mapping)
        .filter(([, prop]) => String(prop).includes('_'))
        .map(([col, prop]) => ({ col, prop }));
      if (snakeProps.length) {
        console.log(`  ⚠️  Snake_case property names (${snakeProps.length}) — consider renaming Drizzle props and mapping to snake columns:`);
        for (const s of snakeProps) console.log(`  - prop '${s.prop}' from column '${s.col}' (suggest: ${toCamelCase(s.col)})`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
