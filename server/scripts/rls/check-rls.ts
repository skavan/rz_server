import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from server_v2/.env regardless of cwd
dotenv.config({ path: resolve(process.cwd(), './.env') });

async function runQuery<T = any>(pool: Pool, sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as any;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing. Add it to server_v2/.env');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Show role and RLS bypass flags
    const roles = await runQuery(pool, `SELECT current_user, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`);
    console.log('Current role:', roles[0]);

    // Sanity: show RLS flag on products
    const rls = await runQuery(pool, `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='products'`);
    console.log('Products RLS:', rls[0] || 'not found');

    // Begin txn, set GUCs, run counts for home_id scoping
    await runQuery(pool, 'BEGIN');
    await runQuery(pool, `SELECT set_config('app.home_ids', $1, true)`, ['2']);
    const cntHome2 = await runQuery(pool, `SELECT COUNT(*)::int AS count FROM public.products`);
    console.log('Count with home_ids=2:', cntHome2[0]);

    await runQuery(pool, `SELECT set_config('app.home_ids', $1, true)`, ['999999']);
    const cntNone = await runQuery(pool, `SELECT COUNT(*)::int AS count FROM public.products`);
    console.log('Count with home_ids=999999 (expect 0):', cntNone[0]);
    await runQuery(pool, 'ROLLBACK');

    // Optional: customer guard (uncomment if you created policies using customer_id)
    // await runQuery(pool, 'BEGIN');
    // await runQuery(pool, `SELECT set_config('app.customer_id', $1, true)`, ['1']);
    // await runQuery(pool, `SELECT set_config('app.home_ids', $1, true)`, ['2,3']);
    // const cntCust = await runQuery(pool, `SELECT COUNT(*)::int AS count FROM public.products`);
    // console.log('Count with customer_id=1 & home_ids=2,3:', cntCust[0]);
    // await runQuery(pool, 'ROLLBACK');

    console.log('RLS check complete. Note: You must run as a non-superuser without BYPASSRLS to see filtering.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('RLS check failed:', err);
  process.exit(1);
});
