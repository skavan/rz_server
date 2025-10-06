import { Pool } from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigrations(databaseUrl: string) {
  // Generate SQL from shared schema
  const sharedRoot = join(__dirname, '../../../drizzle/shared');
  console.log('🧩 Generating migrations from shared schema...');
  execSync('npx drizzle-kit generate', { cwd: sharedRoot, stdio: 'inherit' });

  const drizzleDir = join(sharedRoot, 'drizzle');
  const sqlFiles = readdirSync(drizzleDir).filter(f => f.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) {
    console.log('ℹ️ No migration SQL files found. Nothing to apply.');
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const file of sqlFiles) {
      const sql = readFileSync(join(drizzleDir, file), 'utf-8');
      const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      console.log(`📄 Applying ${file} (${statements.length} stmts)...`);
      for (const stmt of statements) {
        // Some statements may be CREATE TYPE or CREATE TABLE etc.
        try {
          await pool.query(stmt);
        } catch (err) {
          console.warn('⚠️ Statement failed (continuing):', (err as Error).message);
        }
      }
    }
    console.log('✅ Migrations applied');
  } finally {
    await pool.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  await applyMigrations(url);
}

main().catch(err => {
  console.error('❌ apply-migrations error:', err);
  process.exit(1);
});
