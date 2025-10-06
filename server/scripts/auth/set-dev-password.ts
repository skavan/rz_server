import { drizzle } from '@postgress/shared';
import { users, eq } from '@postgress/shared';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const email = 'suresh.kavan@gmail.com';
  const password = 'dragonfly';
  const hash = await bcrypt.hash(password, 10);

  const res = await db
    .update(users)
    .set({ password_hash: hash })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email });

  console.log('Updated user password:', res);
  await pool.end();
}

main().catch((err) => {
  console.error('Error setting password:', err);
  process.exit(1);
});
