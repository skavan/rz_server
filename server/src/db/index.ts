/**
 * Clean Database Connection - Drizzle + PostgreSQL
 * Uses shared schema package for single source of truth
 */
import { Pool } from 'pg';
import { drizzle } from '@skavan/rentalzen-drizzle';
import * as schema from '@skavan/rentalzen-drizzle';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable TCP keepalive on pooled sockets so idle connections aren't reaped
  // by NAT/firewall (default OS keepalive idle is ~2h, far longer than most
  // routers will hold an idle flow). 10s initial delay puts probes on the
  // wire well before any reasonable idle-eviction window.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Recycle pool clients that sit idle longer than 30s, so we never hand out
  // a connection that the network has silently dropped.
  idleTimeoutMillis: 30_000,
});

// Create Drizzle database instance with schema
// Note: Explicit type annotation avoids TS emitting non-portable type references
export const db: any = drizzle(pool, { schema });

// Export pool for raw queries if needed
export { pool };

// Note: Avoid logging on each pool 'connect' event, as it fires for every new client.
// Startup connectivity and DB info are logged in server.ts after a one-time test query.

pool.on('error', (err) => {
  // pg emits 'error' when an *idle* pooled client's socket dies (e.g. a NAT
  // table entry was evicted overnight). This is not fatal — the pool will
  // discard the dead client and create a fresh one on next checkout. Do NOT
  // exit the process here; doing so would drop all in-flight requests, SSE
  // subscribers, the PG LISTEN connection, and the Playwright browser pool
  // every time the network blinks.
  console.error('PostgreSQL idle client error (pool will recycle):', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔌 Closing database connection...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔌 Closing database connection...');
  await pool.end();
  process.exit(0);
});

/**
 * Per-request tenant GUCs and scoped execution
 *
 * Usage example:
 *   await withTenantScope({ customerId: 1, homeIds: [2] }, async (scopedDb) => {
 *     return scopedDb.select().from(users).limit(1);
 *   });
 */
// Optionally assume an application DB role (e.g., app_role) so RLS is enforced even if the base
// connection user owns tables. Set APP_DB_ROLE in server_v2/.env to enable.
const APP_DB_ROLE = process.env.APP_DB_ROLE;

export async function setTenantGucsOnClient(client: any, params: { customerId: number; homeIds?: number[] }) {
  const { customerId, homeIds } = params;
  const homesCsv = Array.isArray(homeIds) && homeIds.length > 0 ? homeIds.filter(Number.isFinite).join(',') : '';
  // Use set_config with is_local=true to confine to current transaction
  await client.query("select set_config('app.customer_id', $1, true)", [String(customerId)]);
  await client.query("select set_config('app.home_ids', $1, true)", [homesCsv]);
}

function quoteIdent(name: string): string {
  // Safe identifier quoting for role/schema/table names
  if (/^[a-z_][a-z0-9_]*$/i.test(name)) return name;
  return '"' + name.replace(/"/g, '""') + '"';
}

async function maybeSetAppRole(client: any) {
  if (!APP_DB_ROLE) return;
  try {
    // Use SET LOCAL so the role applies only within this transaction
    await client.query(`SET LOCAL ROLE ${quoteIdent(APP_DB_ROLE)}`);
  } catch (err: any) {
    console.warn('[db] SET LOCAL ROLE failed; continuing without role:', err?.message || err);
  }
}

export async function withTenantScope<T>(params: { customerId: number; homeIds?: number[] }, fn: (scopedDb: any, client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
  await maybeSetAppRole(client);
    await setTenantGucsOnClient(client, params);
    const scopedDb: any = drizzle(client, { schema });
    const result = await fn(scopedDb, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}
