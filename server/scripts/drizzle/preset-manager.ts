/**
 * Preset Manager for Table Rebuilds
 * Orchestrates multiple table rebuilds based on predefined presets
 */
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ============================================
// PRESET CONFIGURATIONS
// ============================================
interface TableConfig {
  name: string;
  seedFile?: string;
  seedKey?: string;
}

interface PresetConfig {
  name: string;
  description: string;
  tables: TableConfig[];
}

const PRESETS: Record<string, PresetConfig> = {
  core_tables: {
    name: 'core_tables',
    description: 'Essential authentication and customer tables',
    tables: [
      { name: 'verification_tokens' },
      { name: 'customers', seedFile: '1-customers.json', seedKey: 'customers' },
      { name: 'users', seedFile: '2-users.json', seedKey: 'users' },
      { name: 'accounts', seedFile: '2-users.json', seedKey: 'accounts' },
      { name: 'sessions', seedFile: '2-users.json', seedKey: 'sessions' }
    ]
  },
  
  auth_tables: {
    name: 'auth_tables',
    description: 'Authentication tables only',
    tables: [
      { name: 'verification_tokens' },
      { name: 'accounts', seedFile: '2-users.json', seedKey: 'accounts' },
      { name: 'sessions', seedFile: '2-users.json', seedKey: 'sessions' }
    ]
  },

  sku_tables: {
    name: 'sku_tables',
    description: 'SKU and SKU components tables for product management',
    tables: [
      { name: 'skus', seedFile: '6-skus.json', seedKey: 'skus' },
      { name: 'sku_components', seedFile: '5-sku_components.json', seedKey: 'sku_components' }
    ]
  }
};

// ============================================
// LOGGING
// ============================================
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const icons = { info: 'ℹ️ ', success: '✅', warning: '⚠️ ', error: '❌' };
  console.log(`${icons[type]} ${message}`);
}

// ============================================
// PRESET MANAGER
// ============================================
export async function runPreset(presetName: string, operation: 'rebuild' | 'drop' | 'create' | 'seed' = 'rebuild'): Promise<void> {
  const preset = PRESETS[presetName];
  
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(PRESETS).join(', ')}`);
  }
  
  log(`🚀 Running preset: ${preset.name} (${preset.description})`, 'info');
  log(`Operation: ${operation}`, 'info');
  log(`Tables: ${preset.tables.map(t => t.name).join(', ')}`, 'info');
  
  for (const table of preset.tables) {
    try {
      log(`Processing table: ${table.name}`, 'info');
      
      // Build command
      let cmd = `npx tsx drizzle-rebuild.ts ${operation} ${table.name}`;
      
      if (table.seedFile) {
        // Pass just the filename; drizzle-rebuild looks in scripts/drizzle/seed-data
        cmd += ` --seed-file=${table.seedFile}`;
      }
      
      if (table.seedKey) {
        cmd += ` --seed-key=${table.seedKey}`;
      }
      
      // Execute the rebuild command
      execSync(cmd, { 
        stdio: 'inherit',
        cwd: __dirname,
      });
      
      log(`Completed table: ${table.name}`, 'success');
      
    } catch (error) {
      log(`Failed to process table ${table.name}: ${error}`, 'error');
      throw error;
    }
  }
  
  log(`🎉 Preset completed: ${preset.name}`, 'success');
}

export function listPresets(): void {
  console.log('\n📋 Available Presets:\n');
  
  for (const [, preset] of Object.entries(PRESETS)) {
    console.log(`${preset.name}:`);
    console.log(`  Description: ${preset.description}`);
    console.log(`  Tables: ${preset.tables.map(t => t.name).join(', ')}`);
    console.log('');
  }
}

// ============================================
// NUMERIC FILE SEEDING (your JSON files)
// ============================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEED_DIR = join(__dirname, 'seed-data');

function getNumeric(name: string): number | null {
  const m = name.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function getSeedFilesNumeric(): string[] {
  if (!existsSync(SEED_DIR)) return [];
  const files = readdirSync(SEED_DIR)
    .filter(f => f.toLowerCase().endsWith('.json'))
    .filter(f => !f.toLowerCase().endsWith('.transformed.json'));
  return files
    .map(f => ({ f, n: getNumeric(f) }))
    .filter(x => x.n !== null)
    .sort((a, b) => (a.n! - b.n!))
    .map(x => x.f);
}

function transformTagsIfNeeded(filename: string, json: any): { filePath: string; seedKey: string; }[] | null {
  if (!json || typeof json !== 'object') return null;
  if (!('tags' in json)) return null;
  const arr = Array.isArray(json.tags) ? json.tags : [];
  const mapped = arr.map((t: any) => {
    const { color, ...rest } = t; // drop color per request
    return {
      ...rest,
      tag_scope: rest.tag_scope ?? 'all',
      tag_type: rest.tag_type ?? 'category',
      is_system: rest.is_system ?? false,
      locked: rest.locked ?? false,
    };
  });
  const out = { tags: mapped };
  const outName = filename.replace(/\.json$/i, '.transformed.json');
  const outPath = join(SEED_DIR, outName);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  return [{ filePath: outPath, seedKey: 'tags' }];
}

export async function runNumeric(operation: 'rebuild' | 'drop' | 'create' | 'seed' = 'rebuild'): Promise<void> {
  log(`📦 Seeding from numeric JSON files in: ${SEED_DIR}`, 'info');
  const files = getSeedFilesNumeric();
  if (files.length === 0) {
    log('No numeric JSON files found.', 'warning');
    return;
  }

  // Build a queue per table so we can enforce dependency order regardless of file order
  const tableToEntries = new Map<string, Array<{ filePath: string; source: string }>>();
  for (const file of files) {
    const full = join(SEED_DIR, file);
    try {
      const raw = readFileSync(full, 'utf-8');
      const json = JSON.parse(raw);
      const keys = Object.keys(json).filter(k => Array.isArray(json[k]));
      for (const key of keys) {
        // Transform tags on the fly to include required fields
        if (key === 'tags') {
          const transformed = transformTagsIfNeeded(file, json);
          if (transformed) {
            for (const { filePath } of transformed) {
              if (!tableToEntries.has('tags')) tableToEntries.set('tags', []);
              tableToEntries.get('tags')!.push({ filePath, source: file });
            }
            continue;
          }
        }
        if (!tableToEntries.has(key)) tableToEntries.set(key, []);
        tableToEntries.get(key)!.push({ filePath: full, source: file });
      }
    } catch (err) {
      log(`Failed indexing file ${file}: ${err}`, 'warning');
    }
  }

  // Dependency-friendly order
  const TABLE_ORDER = [
    'customers', 'users', 'accounts', 'sessions',
    'homes', 'user_home_access', 'user_invites',
    'brands', 'vendors', 'locations', 'categories', 'tags',
    // products first, then skus, then sku_components, then product_components
    'products', 'skus', 'sku_components', 'product_components',
    'inventory_items'
  ];

  // Seed in dependency order first, then any remaining tables
  const allTables = new Set(tableToEntries.keys());
  const inOrder = TABLE_ORDER.filter(t => allTables.has(t));
  const remaining = Array.from(allTables).filter(t => !TABLE_ORDER.includes(t)).sort();
  const schedule = [...inOrder, ...remaining];

  for (const table of schedule) {
    const entries = tableToEntries.get(table)!;
    for (const { filePath, source } of entries) {
      log(`➡️  ${operation.toUpperCase()} ${table} from ${source}`, 'info');
      const quoted = filePath.includes(' ') ? `"${filePath}"` : filePath;
      const cmd = `npx tsx drizzle-rebuild.ts ${operation} ${table} --seed-file=${quoted} --seed-key=${table}`;
      execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    }
  }

  log('🎉 Numeric seeding completed.', 'success');
}

// Seed a single table by discovering all JSON files (numeric order) that contain that top-level key
export async function runSeedTable(tableName: string, operation: 'rebuild' | 'drop' | 'create' | 'seed' = 'rebuild'): Promise<void> {
  log(`📄 Seeding table '${tableName}' from numeric JSON files in: ${SEED_DIR}`, 'info');
  const files = getSeedFilesNumeric();
  let foundAny = false;
  for (const file of files) {
    const full = join(SEED_DIR, file);
    try {
      const raw = readFileSync(full, 'utf-8');
      const json = JSON.parse(raw);
      if (!(tableName in json)) {
        // Special case: if table is 'tags' and file is tags file, transform then seed
        if (tableName === 'tags') {
          const transformed = transformTagsIfNeeded(file, json);
          if (transformed) {
            for (const { filePath } of transformed) {
              const quoted = filePath.includes(' ') ? `"${filePath}"` : filePath;
              const cmd = `npx tsx drizzle-rebuild.ts ${operation} ${tableName} --seed-file=${quoted} --seed-key=${tableName}`;
              log(`➡️  ${operation.toUpperCase()} ${tableName} from ${file} (transformed)`, 'info');
              execSync(cmd, { stdio: 'inherit', cwd: __dirname });
              foundAny = true;
            }
          }
        }
        continue;
      }

      const quoted = full.includes(' ') ? `"${full}"` : full;
      const cmd = `npx tsx drizzle-rebuild.ts ${operation} ${tableName} --seed-file=${quoted} --seed-key=${tableName}`;
      log(`➡️  ${operation.toUpperCase()} ${tableName} from ${file}`, 'info');
      execSync(cmd, { stdio: 'inherit', cwd: __dirname });
      foundAny = true;
    } catch (err) {
      log(`Failed processing ${file}: ${err}`, 'warning');
    }
  }
  if (!foundAny) {
    log(`No JSON files contained the table key '${tableName}'.`, 'warning');
  } else {
    log(`✅ Finished seeding '${tableName}'.`, 'success');
  }
}

// ============================================
// CLI INTERFACE
// ============================================
async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    const nameOrTable = args[1];
    const operation = (args[2] as 'rebuild' | 'drop' | 'create' | 'seed') || 'rebuild';
    
    if (command === 'list') {
      listPresets();
      return;
    }
    
    if (!command) {
      console.log(`
Preset Manager for Table Rebuilds

 Usage: npx tsx preset-manager.ts <command> <name> [operation]

Commands:
  run <preset> [operation]   - Run a preset (default: rebuild)
  list                       - List available presets
  run-numeric [operation]    - Process all JSON files in numeric order (default: seed)
  seed-table <table> [op]    - Seed a single table by scanning JSON files (default op: seed)

Operations:
  rebuild                    - Drop -> Create -> Seed (default)
  drop                       - Drop tables only
  create                     - Create tables only (no seeding)  
  seed                       - Seed tables only (no schema changes)

Examples:
  npx tsx preset-manager.ts run core_tables
  npx tsx preset-manager.ts run core_tables rebuild
  npx tsx preset-manager.ts run auth_tables create
  npx tsx preset-manager.ts list
      `);
      return;
    }
    
    if (command === 'run') {
      if (nameOrTable === 'all') {
        // Alias: run all => run-numeric
        const op = (operation || 'seed') as 'rebuild' | 'drop' | 'create' | 'seed';
        await runNumeric(op);
      } else {
        await runPreset(nameOrTable, operation);
      }
    } else if (command === 'run-numeric') {
      const op = (nameOrTable as 'rebuild' | 'drop' | 'create' | 'seed') || 'rebuild';
      await runNumeric(op);
    } else if (command === 'seed-table') {
      const tableName = nameOrTable;
      const op = (args[2] as 'rebuild' | 'drop' | 'create' | 'seed') || 'rebuild';
      if (!tableName) throw new Error('Missing table name. Usage: npx tsx preset-manager.ts seed-table <table> [operation]');
      await runSeedTable(tableName, op);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Run if called directly
main();
