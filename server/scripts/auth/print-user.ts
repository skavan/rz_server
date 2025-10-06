import { drizzle } from '@postgress/shared';
import { users, eq } from '@postgress/shared';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const email = 'suresh.kavan@gmail.com';
  const res = await db.select().from(users).where(eq(users.email, email));
  console.log(res);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
