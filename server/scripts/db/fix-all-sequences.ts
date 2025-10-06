import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in server_v2/.env');
  const pool = new Pool({ connectionString: url });
  try {
    console.log('🔧 Repairing all sequences in public schema...');
    // Find sequences and their owned table/column
    const q = `
      SELECT 
        n.nspname AS schema,
        c.relname AS sequence_name,
        t.relname AS table_name,
        a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE c.relkind = 'S' AND n.nspname = 'public';`;
    const { rows } = await pool.query(q);
    for (const r of rows) {
      const schema = r.schema;
      const seq = `${schema}.${r.sequence_name}`;
      const table = `${schema}.${r.table_name}`;
      const sql = `SELECT setval('${seq}', COALESCE((SELECT MAX(${r.column_name}) FROM ${table}), 0) + 1, false)`;
      try {
        await pool.query(sql);
        console.log(`✅ ${seq} aligned to ${table}.${r.column_name}`);
      } catch (e: any) {
        console.warn(`⚠️  Failed to align ${seq}: ${e?.message || e}`);
      }
    }
    console.log('✅ Sequence repair completed');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('fix-all-sequences failed:', e);
  process.exit(1);
});
