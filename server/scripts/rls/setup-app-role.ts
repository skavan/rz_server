import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

function quoteIdent(name: string): string {
  // Safe identifier quoting for role/schema/table names
  if (/^[a-z_][a-z0-9_]*$/i.test(name)) return name;
  return '"' + name.replace(/"/g, '""') + '"';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing in server_v2/.env');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const roleName = process.env.APP_DB_ROLE || 'app_role';
    const appUser = process.env.APP_DB_USER; // optional: if you have a distinct DB user for the app
    const qRole = quoteIdent(roleName);

    // 1) Create role if missing (non-superuser, no BYPASSRLS)
    const existsRes = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [roleName]);
    if (existsRes.rowCount === 0) {
      await pool.query(`CREATE ROLE ${qRole} NOINHERIT NOBYPASSRLS NOSUPERUSER LOGIN`);
      console.log(`Created role ${roleName}`);
    } else {
      console.log(`Role ${roleName} already exists`);
    }

    // 2) Optionally grant role to a specific DB user (if provided)
    if (appUser) {
      const userExists = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
      if (userExists.rowCount === 0) {
        console.warn(`DB user ${appUser} not found; skipping GRANT ${roleName}`);
      } else {
        await pool.query(`GRANT ${qRole} TO ${quoteIdent(appUser)}`);
        console.log(`Granted ${roleName} to user ${appUser}`);
      }
    }

  // 3) Grant minimal privileges on schema/tables/sequences; rely on RLS to filter
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${qRole}`);
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${qRole}`);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${qRole}`);
  // Sequences are needed for inserts that use default nextval()
  await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${qRole}`);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${qRole}`);

    // 4) Show final role flags
    const info = await pool.query(`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1`, [roleName]);
    console.log('Role created/ensured:', info.rows[0]);
    console.log('Done. Configure your API to connect using this role or a user GRANTED this role.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('setup-app-role failed:', e);
  process.exit(1);
});
