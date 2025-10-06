/**
 * Inventory v2 bulk rebuild orchestrator (uses Drizzle as source of truth)
 * Drops, recreates, and optionally seeds inventory-related tables in dependency order.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

import { rebuildTable } from './drizzle-rebuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from server_v2 root
dotenv.config({ path: join(__dirname, '../../.env') });

// Tables in dependency-aware order
// Note: Assumes base tables like customers/users/homes already exist.
const TABLES = [
  // taxonomy/reference
  'categories',
  'brands',
  'vendors',
  'tags',
  // core
  'products',
  'skus',
  'locations',
  // relationships/components
  'product_components',
  'sku_components',
  // operational
  'inventory_items',
  'media_assets',
];

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'rebuild'; // rebuild|create|drop|seed
  const skipSeed = mode === 'create';
  const dropOnly = mode === 'drop';
  const createOnly = mode === 'create';
  const seedOnly = mode === 'seed';

  // Ensure Drizzle SQL is up-to-date once before looping
  const sharedPath = join(__dirname, '../../../drizzle/shared');
  execSync('npx drizzle-kit generate', { cwd: sharedPath, stdio: 'inherit' });

  for (const table of TABLES) {
    await rebuildTable({
      tableName: table,
      skipSeed,
      dropOnly,
      createOnly,
      seedOnly,
    });
  }
}

main().catch((err) => {
  console.error('Bulk inventory rebuild failed:', err);
  process.exit(1);
});
