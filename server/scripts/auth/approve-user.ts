import { drizzle, users, userHomeAccess, eq } from '@skavan/rentalzen-drizzle';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

type UserRole = 'admin' | 'manager' | 'user' | 'cleaner';
type HomeRole = 'admin' | 'manager' | 'viewer';

type CliOptions = {
  email: string;
  customerId: number;
  role: UserRole;
  homes: number[];
  homeRole: HomeRole;
};

const DEFAULT_USER_ROLE: UserRole = 'user';
const DEFAULT_HOME_ROLE: HomeRole = 'viewer';

function parseArgs(): CliOptions {
  const rawArgs = process.argv.slice(2);
  const opts: Partial<CliOptions> = { homes: [] };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) continue;
    const value = rawArgs[i + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--email':
        opts.email = value.trim().toLowerCase();
        break;
      case '--customer':
        opts.customerId = Number(value);
        break;
      case '--role':
        opts.role = value as UserRole;
        break;
      case '--homes':
        opts.homes = value
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((n) => Number.isFinite(n));
        break;
      case '--home-role':
        opts.homeRole = value as HomeRole;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!opts.email) {
    throw new Error('Missing required --email');
  }
  if (!opts.customerId || !Number.isFinite(opts.customerId)) {
    throw new Error('Missing or invalid --customer (customer id)');
  }

  const role = opts.role ?? DEFAULT_USER_ROLE;
  if (!['admin', 'manager', 'user', 'cleaner'].includes(role)) {
    throw new Error(`Invalid user role: ${role}`);
  }

  const homeRole = opts.homeRole ?? DEFAULT_HOME_ROLE;
  if (!['admin', 'manager', 'viewer'].includes(homeRole)) {
    throw new Error(`Invalid home role: ${homeRole}`);
  }

  return {
    email: opts.email,
    customerId: opts.customerId,
    role,
    homes: opts.homes ?? [],
    homeRole,
  };
}

async function main() {
  const options = parseArgs();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [user] = await db.select().from(users).where(eq(users.email, options.email)).limit(1);
    if (!user) {
      throw new Error(`User with email ${options.email} not found`);
    }

    const nextSessionVersion = (user.sessionVersion ?? 0) + 1;

    const updated = await db
      .update(users)
      .set({
        customerId: options.customerId,
        role: options.role,
        isActive: true,
        sessionVersion: nextSessionVersion,
      })
      .where(eq(users.id, user.id))
      .returning();

    if (options.homes.length > 0) {
      for (const homeId of options.homes) {
        if (!Number.isFinite(homeId)) continue;
        try {
          await db
            .insert(userHomeAccess)
            .values({ userId: user.id, homeId, role: options.homeRole })
            .onConflictDoNothing();
        } catch (err) {
          console.warn(`Warning: failed to grant home ${homeId}:`, (err as Error).message);
        }
      }
    }

    console.log('✅ User updated');
    console.table(
      updated.map((row) => ({
        id: row.id,
        email: row.email,
        customerId: row.customerId,
        role: row.role,
        sessionVersion: row.sessionVersion,
      }))
    );

    if (options.homes.length > 0) {
      const assignments = await db
        .select({ homeId: userHomeAccess.homeId, role: userHomeAccess.role })
        .from(userHomeAccess)
        .where(eq(userHomeAccess.userId, user.id));
      console.log('🏠 Home access:');
      console.table(assignments);
    }

    console.log('\nNext steps: user must log in again to receive the updated role.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ approve-user failed:', err);
  process.exit(1);
});
