import { readFile } from 'fs/promises';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: resolve(process.cwd(), './.env') });

function splitStatements(sql: string): string[] {
  // Prefer Drizzle statement breakpoints; fallback to semicolon-newline split
  const chunks = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length > 0) return chunks;
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(';') ? s : `${s};`));
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: tsx scripts/run-sql.ts <path-to-sql>');
    process.exit(1);
  }
  const filePath = resolve(process.cwd(), fileArg);
  const sql = await readFile(filePath, 'utf8');

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in server_v2/.env');

  const pool = new Pool({ connectionString: url });
  try {
    const statements = splitStatements(sql);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (!stmt) continue;
        try {
          await client.query(stmt);
          console.log(`✅ [${i + 1}/${statements.length}] OK`);
        } catch (err: any) {
          console.error(`❌ [${i + 1}/${statements.length}]`, err?.message || err);
          throw err;
        }
      }
      await client.query('COMMIT');
      console.log('✅ All statements applied successfully');
    } catch (err) {
      try { await pool.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('run-sql failed:', e);
  process.exit(1);
});
