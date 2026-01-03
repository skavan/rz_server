import { Pool } from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_TABLE = 'app_migrations';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Map<string, { checksum: string }>> {
  const res = await pool.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM ${MIGRATIONS_TABLE}`
  );
  return new Map(res.rows.map(r => [r.filename, { checksum: r.checksum }]));
}

async function applyMigrations(databaseUrl: string, opts: { baseline: boolean }) {
  // Expect SQL migrations to already exist under drizzle/shared/drizzle
  const sharedRoot = join(__dirname, '../../../drizzle/shared');

  const drizzleDir = join(sharedRoot, 'drizzle');
  const sqlFiles = readdirSync(drizzleDir).filter(f => f.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) {
    console.log('ℹ️ No migration SQL files found. Nothing to apply.');
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    for (const file of sqlFiles) {
      const sql = readFileSync(join(drizzleDir, file), 'utf-8');
      const checksum = sha256(sql);

      const already = applied.get(file);
      if (already) {
        if (already.checksum !== checksum) {
          throw new Error(
            `Migration file changed after being applied: ${file}.\n` +
              `Recorded checksum=${already.checksum}, current checksum=${checksum}.\n` +
              `Refusing to continue to avoid corrupting schema/data. If this is intentional, create a new migration instead.`
          );
        }
        console.log(`↩️  Skipping ${file} (already applied)`);
        continue;
      }

      const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

      if (opts.baseline) {
        await pool.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING`,
          [file, checksum]
        );
        console.log(`📌 Baseline marked ${file} (no SQL executed)`);
        continue;
      }

      console.log(`📄 Applying ${file} (${statements.length} stmts)...`);
      await pool.query('BEGIN');
      try {
        for (const stmt of statements) {
          await pool.query(stmt);
        }
        await pool.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2)`,
          [file, checksum]
        );
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
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

  const baselineFromEnv = process.env.BASELINE === '1' || process.env.BASELINE === 'true';
  const baselineFromNpmConfig =
    process.env.npm_config_baseline === '1' || process.env.npm_config_baseline === 'true';
  const baselineFromArgs = process.argv.some(arg => arg === '--baseline' || arg.startsWith('--baseline='));

  let baselineFromNpm = false;
  const npmConfigArgv = process.env.npm_config_argv;
  if (npmConfigArgv) {
    try {
      const parsed = JSON.parse(npmConfigArgv) as { original?: string[] };
      const original = parsed.original ?? [];
      baselineFromNpm = original.some(arg => arg === '--baseline' || arg.startsWith('--baseline='));
    } catch {
      // ignore
    }
  }

  const baseline = baselineFromEnv || baselineFromNpmConfig || baselineFromArgs || baselineFromNpm;
  await applyMigrations(url, { baseline });
}

main().catch(err => {
  console.error('❌ apply-migrations error:', err);
  process.exit(1);
});
