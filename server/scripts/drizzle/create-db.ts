import { Pool } from 'pg';
import { parse } from 'url';
import * as dotenv from 'dotenv';

dotenv.config();

function buildAdminUrl(dbUrl: string): string {
  // Repoint provided DATABASE_URL to the default 'postgres' database for creating a new DB
  const u = new URL(dbUrl);
  u.pathname = '/postgres';
  return u.toString();
}

async function createDatabase(targetDbName: string) {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL is not set');

  const adminUrl = buildAdminUrl(sourceUrl);
  const pool = new Pool({ connectionString: adminUrl });
  try {
    // check if db exists
    const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`✅ Database already exists: ${targetDbName}`);
      return;
    }
    console.log(`🛠️ Creating database: ${targetDbName}`);
    // Use identifier quoting safely
    await pool.query(`CREATE DATABASE "${targetDbName}"`);
    console.log(`✅ Created database: ${targetDbName}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const name = process.argv[2] || 'rental_inventory_v2';
  await createDatabase(name);
}

main().catch(err => {
  console.error('❌ create-db error:', err);
  process.exit(1);
});
