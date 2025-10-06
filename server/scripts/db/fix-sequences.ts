import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), './.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in server_v2/.env');
  const pool = new Pool({ connectionString: url });
  try {
    console.log('🔧 Repairing sequences to match table maxima...');
    // Repair products_id_seq specifically (common offender after manual seeds)
    await pool.query(
      "SELECT setval('public.products_id_seq', COALESCE((SELECT MAX(id) FROM public.products), 0) + 1, false)"
    );
    console.log('✅ products_id_seq aligned');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('fix-sequences failed:', e);
  process.exit(1);
});
