import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../src/db/index.js';
import * as schema from '@postgress/shared';

function readSql(file: string) {
  return fs.readFileSync(file, 'utf8');
}

async function exec(sql: string) {
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

// Infer target tables from schema or accept CLI args
function getTargetTables(): string[] {
  // Prefer explicit list if passed: node setup-realtime.ts products,inventory_items,locations
  const arg = process.argv[2];
  if (arg) return arg.split(',').map(s => s.trim()).filter(Boolean);

  // Fallback: pick known tables if present in schema export
  const candidates = ['products', 'inventory_items', 'locations', 'homes', 'product_components', 'vendors', 'brands', 'skus', 'sku_components'];
  return candidates.filter(t => t in (schema as any));
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const sqlDir = path.resolve(__dirname, './sql');
  const fnSql = readSql(path.join(sqlDir, 'notify_data_change.sql'));
  await exec(fnSql);
  console.log('✅ Function notify_data_change ensured');

  const createTriggerTpl = readSql(path.join(sqlDir, 'create_trigger_for_table.sql'));
  const tables = getTargetTables();
  for (const table of tables) {
    const s = createTriggerTpl.replace(/\{\{table\}\}/g, table);
    await exec(s);
    console.log(`✅ Trigger ensured for ${table}`);
  }

  // Keep the pool open only for script lifetime
  await pool.end();
}

main().catch((e) => {
  console.error('❌ setup-realtime failed:', e);
  process.exit(1);
});
