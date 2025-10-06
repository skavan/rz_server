import { drizzle } from '@postgress/shared';
import { users, userHomeAccess, eq } from '@postgress/shared';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const email = 'suresh.kavan@gmail.com';

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error('Dev user not found');

  const grants = [1, 2]; // grant access to homes 1 and 2
  for (const homeId of grants) {
    try {
      await db.insert(userHomeAccess).values({ userId: (user as any).id, homeId, role: 'admin' as any }).onConflictDoNothing?.();
    } catch (e) {
      // Fallback if onConflictDoNothing not available in runtime build
    }
  }

  const rows = await db.select().from(userHomeAccess).where(eq(userHomeAccess.userId, (user as any).id));
  console.log('Granted memberships:', rows);
  await pool.end();
}

main().catch((err) => {
  console.error('Error granting memberships:', err);
  process.exit(1);
});
