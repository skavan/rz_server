import { Pool } from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const usersCol = await pool.query(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_name = 'users' and column_name = 'session_version'`
    );
    const invitesCount = await pool.query(`select count(*) from "user_invites"`);

    const homesRows = await pool.query(`select id, customer_id from homes order by id asc limit 20`);
    const uhaCount = await pool.query(`select count(*) from "user_home_access"`);
    const uhaSample = await pool.query(`select user_id, home_id, role from "user_home_access" order by id asc limit 10`);

    console.log('users.session_version:', usersCol.rows[0] || null);
    console.log('user_invites count:', invitesCount.rows[0]?.count ?? '0');
    console.log('homes:', homesRows.rows);
    console.log('user_home_access count:', uhaCount.rows[0]?.count ?? '0');
    console.log('user_home_access sample:', uhaSample.rows);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('check-db error:', err);
  process.exit(1);
});
