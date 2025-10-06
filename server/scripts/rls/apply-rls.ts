import { readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

function splitStatements(sql: string): string[] {
  // Drizzle uses statement breakpoints. Also handle raw semicolons conservatively by using the markers first.
  const chunks = sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean);
  if (chunks.length > 0) return chunks;
  return sql
    .split(/;\s*\n/) // split on semicolon followed by newline
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s.endsWith(';') ? s : `${s};`));
}

async function applyRls(sqlPath: string) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = await readFile(sqlPath, 'utf-8');
  const statements = splitStatements(sql);
  const pool = new Pool({ connectionString: url });
  try {
    console.log(`\n🔐 Applying RLS policies from ${sqlPath}`);
    for (const [i, stmt] of statements.entries()) {
      if (!stmt) continue;
      
      // Extract operation details for better logging
      const getOperationInfo = (sql: string): string => {
        const trimmed = sql.trim();
        if (trimmed.startsWith('ALTER TABLE')) {
          const match = trimmed.match(/ALTER TABLE.*?(\w+)\s+ENABLE ROW LEVEL SECURITY/);
          return match ? `ALTER TABLE ${match[1]} ENABLE RLS` : 'ALTER TABLE';
        }
        if (trimmed.startsWith('DO $do$')) {
          const policyMatch = trimmed.match(/CREATE POLICY (\w+) ON (?:public\.)?(\w+)/);
          if (policyMatch) {
            return `CREATE POLICY ${policyMatch[1]} ON ${policyMatch[2]}`;
          }
          const grantMatch = trimmed.match(/GRANT.*TO.*ON.*?(\w+)/);
          if (grantMatch) {
            return `GRANTS ON ${grantMatch[1]}`;
          }
          return 'DO BLOCK';
        }
        return trimmed.substring(0, 50) + (trimmed.length > 50 ? '...' : '');
      };
      
      const operation = getOperationInfo(stmt);
      
      try {
        await pool.query(stmt);
        console.log(`✅ [${i + 1}/${statements.length}] ${operation}`);
      } catch (err) {
        console.warn(`⚠️  [${i + 1}/${statements.length}] ${operation} - ${String((err as Error).message || err)}`);
      }
    }
    console.log('✅ RLS apply complete');
  } finally {
    await pool.end();
  }
}

async function main() {
  const sqlFile = join(__dirname, 'sample-rls-policies.sql');
  await applyRls(sqlFile);
}

main().catch(err => {
  console.error('❌ RLS apply error:', err);
  process.exit(1);
});
