/**
 * Drizzle Table Rebuild Tool
 * Handles single table operations: drop -> recreate -> seed
 */
import { drizzle } from '@skavan/rentalzen-drizzle';
import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, isAbsolute, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from server_v2 directory (two levels up from scripts/drizzle)
dotenv.config({ path: resolve(__dirname, '../../.env') });

// ============================================
// LOGGING
// ============================================
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const icons = { info: 'ℹ️ ', success: '✅', warning: '⚠️ ', error: '❌' };
  console.log(`${icons[type]} ${message}`);
}

// ============================================
// DATABASE MANAGER
// ============================================
class SimpleTableManager {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1
    });
    this.db = drizzle(this.pool);
  }

  async disableForeignKeys(): Promise<void> {
    try {
      log('🔓 Disabling foreign key constraints...');
      await this.pool.query('SET session_replication_role = replica');
      log('Foreign key constraints disabled', 'success');
    } catch (error) {
      log(`Failed to disable foreign keys: ${error}`, 'error');
      throw error;
    }
  }

  async enableForeignKeys(): Promise<void> {
    try {
      log('🔒 Re-enabling foreign key constraints...');
      await this.pool.query('SET session_replication_role = DEFAULT');
      log('Foreign key constraints re-enabled', 'success');
    } catch (error) {
      log(`Failed to re-enable foreign keys: ${error}`, 'error');
      throw error;
    }
  }

  async dropTable(tableName: string): Promise<void> {
    try {
      log(`Dropping table: ${tableName}`);
      await this.pool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
      log(`Dropped table: ${tableName}`, 'success');
    } catch (error) {
      log(`Failed to drop table ${tableName}: ${error}`, 'warning');
    }
  }

  async createTable(tableName: string): Promise<void> {
    try {
      log(`Creating table: ${tableName}`);
      
      // Generate schema from drizzle-kit
      const sharedPath = join(__dirname, '../../../drizzle/shared');
      execSync('npx drizzle-kit generate', { 
        cwd: sharedPath,
        stdio: 'pipe'
      });
      
      // Read migration SQL and extract table-specific statements
      const tableSQL = await this.getTableSQL(sharedPath, tableName);
      
      if (tableSQL.length === 0) {
        log(`No SQL found for table: ${tableName}`, 'warning');
        return;
      }

      // Execute each statement for this table
      for (const statement of tableSQL) {
        try {
          await this.pool.query(statement);
          log(`Executed: ${this.getStatementType(statement)}`, 'success');
        } catch (error) {
          log(`Statement warning: ${error}`, 'warning');
        }
      }
      
      log(`Created table: ${tableName}`, 'success');
    } catch (error) {
      log(`Failed to create table ${tableName}: ${error}`, 'error');
      throw error;
    }
  }

  private async getTableSQL(sharedPath: string, tableName: string): Promise<string[]> {
    try {
      const fs = await import('fs/promises');
      const drizzlePath = join(sharedPath, 'drizzle');
      const files = await fs.readdir(drizzlePath);
      const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
      
      let tableStatements: string[] = [];
      let allStatements: string[] = [];
      const enumStatements: Array<{ raw: string; name: string; values: string }>= [];
      
      for (const file of sqlFiles) {
        const sql = await fs.readFile(join(drizzlePath, file), 'utf-8');
        const statements = sql
          .split('--> statement-breakpoint')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        allStatements.push(...statements);
        // Capture CREATE TYPE enum statements
        for (const stmt of statements) {
          const m = stmt.match(/CREATE\s+TYPE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+AS\s+ENUM\s*\(([^)]*)\)/i);
          if (m) {
            enumStatements.push({ raw: stmt, name: m[1], values: m[2] });
          }
        }
        // Filter statements relevant to our table
        for (const statement of statements) {
          if (this.isStatementForTable(statement, tableName)) {
            tableStatements.push(statement);
          }
        }
      }
      // If tableStatements reference enum types, prepend idempotent CREATE TYPE blocks for them
      const usedTypeNames = new Set<string>();
      for (const stmt of tableStatements) {
        for (const e of enumStatements) {
          if (stmt.includes(` ${e.name} `) || stmt.includes(`"${e.name}"`)) {
            usedTypeNames.add(e.name);
          }
        }
      }
      const ensureEnumBlocks: string[] = [];
      for (const e of enumStatements) {
        if (!usedTypeNames.has(e.name)) continue;
        const safeBlock = `DO $$ BEGIN\nIF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${e.name}') THEN\n  CREATE TYPE "${e.name}" AS ENUM (${e.values});\nEND IF;\nEND $$;`;
        ensureEnumBlocks.push(safeBlock);
      }
      
      return [...ensureEnumBlocks, ...tableStatements];
    } catch (error) {
      log(`Error reading migration files: ${error}`, 'warning');
      return [];
    }
  }

  private isStatementForTable(statement: string, tableName: string): boolean {
    return statement.includes(`"${tableName}"`);
  }

  private getStatementType(statement: string): string {
    if (statement.includes('CREATE TABLE')) return 'CREATE TABLE';
    if (statement.includes('ALTER TABLE')) return 'ALTER TABLE';
    if (statement.includes('CREATE INDEX')) return 'CREATE INDEX';
    return 'SQL statement';
  }

  async seedTable(tableName: string, seedFile?: string, seedKey?: string, appendMode?: boolean): Promise<void> {
    try {
      const key = seedKey || tableName;
      const file = seedFile || `${tableName}.json`;
      // Resolve seed file: allow absolute path, then local scripts/drizzle/seed-data, then fallback to server_v2/seed-data
      let seedPath = '';
      if (isAbsolute(file)) {
        seedPath = file;
      } else {
        const local = join(__dirname, 'seed-data', file);
        if (existsSync(local)) {
          seedPath = local;
        } else {
          const fallback = join(__dirname, '..', '..', 'seed-data', file);
          seedPath = fallback;
        }
      }
      
      try {
        const seedData = JSON.parse(await readFile(seedPath, 'utf-8'));
        const records = seedData[key];
        
        if (!records || !Array.isArray(records)) {
          log(`No seed data found for key '${key}' in ${file}`, 'warning');
          return;
        }

        if (records.length === 0) {
          log(`Seed data array is empty for ${tableName}`, 'info');
          return;
        }

        log(`Seeding table: ${tableName} with ${records.length} records${appendMode ? ' (append mode)' : ' (replace mode)'}`);
        
        // Clear existing data only if not in append mode
        if (!appendMode) {
          await this.pool.query(`DELETE FROM "${tableName}"`);
        }
        
        // Insert new data
        for (const record of records) {
          const columns = Object.keys(record);
          const values = Object.values(record);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          
          const insertSQL = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
          `;
          
          await this.pool.query(insertSQL, values);
        }
        
        log(`Seeded ${records.length} records in ${tableName}`, 'success');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          log(`No seed file specified for table: ${tableName}`, 'warning');
        } else {
          log(`Failed to seed table ${tableName}: ${error}`, 'error');
          throw error;
        }
      }
    } catch (error) {
      log(`Failed to seed table ${tableName}: ${error}`, 'error');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ============================================
// MAIN FUNCTION
// ============================================
export async function rebuildTable(options: {
  tableName: string;
  seedFile?: string;
  seedKey?: string;
  appendMode?: boolean;
  skipSeed?: boolean;
  dropOnly?: boolean;
  createOnly?: boolean;
  seedOnly?: boolean;
}): Promise<void> {
  const manager = new SimpleTableManager();
  
  try {
    log(`🏗️  Starting table rebuild: ${options.tableName}`, 'info');
    
    if (!options.seedOnly) {
      await manager.disableForeignKeys();
      
      if (!options.createOnly) {
        await manager.dropTable(options.tableName);
      }
      
      if (!options.dropOnly) {
        await manager.createTable(options.tableName);
      }
    }
    
    if (!options.skipSeed && !options.dropOnly) {
      await manager.seedTable(options.tableName, options.seedFile, options.seedKey, options.appendMode);
    }
    
    if (!options.seedOnly) {
      await manager.enableForeignKeys();
    }
    
    log(`🎉 Table rebuild completed: ${options.tableName}`, 'success');
  } catch (error) {
    log(`Failed to rebuild table: ${error}`, 'error');
    throw error;
  } finally {
    await manager.close();
  }
}

// ============================================
// CLI INTERFACE
// ============================================
async function main() {
  try {
    const args = process.argv.slice(2);
    
    // Handle different argument patterns
    let command: string;
    let tableName: string;
    
    if (args.length === 0) {
      console.log(`
Drizzle Table Rebuild Tool

Usage: npx tsx drizzle-rebuild.ts [command] <tableName> [options]

Commands:
  rebuild <tableName>        - Drop, recreate and seed table (default)
  create <tableName>         - Create table only
  drop <tableName>           - Drop table only  
  seed <tableName>           - Seed table only

Options:
  --seed=<file>             - Seed file to use (e.g., --seed=1-customers.json)
  --seed-key=<key>          - Key in seed file (defaults to table name)
  --append                  - Append seed data instead of replacing (default: replace)

Examples:
  npx tsx drizzle-rebuild.ts rebuild customers --seed=1-customers.json
  npx tsx drizzle-rebuild.ts customers --seed=1-customers.json  (shorthand for rebuild)
  npx tsx drizzle-rebuild.ts create accounts
  npx tsx drizzle-rebuild.ts seed users --seed=2-users.json
  npx tsx drizzle-rebuild.ts seed users --seed=2-users.json --append
  npx tsx drizzle-rebuild.ts drop accounts
      `);
      return;
    }
    
    // Check if first arg is a known command
    const knownCommands = ['rebuild', 'create', 'drop', 'seed'];
    if (knownCommands.includes(args[0])) {
      command = args[0];
      tableName = args[1];
    } else {
      // Default to rebuild if first arg is not a command
      command = 'rebuild';
      tableName = args[0];
    }
    
    if (!tableName) {
      console.log(`
Drizzle Table Rebuild Tool

Usage: npx tsx drizzle-rebuild.ts <command> <tableName> [options]

Commands:
  rebuild <table>            - Full rebuild: drop -> create -> seed
  drop <table>               - Drop table only  
  create <table>             - Create table only (no seeding)
  seed <table>               - Seed table only (no schema changes)

Options:
  --seed-file=<file>        - Seed file to use (e.g., --seed-file=2-users.json)
  --seed=<file>             - Shorthand for --seed-file
  --seed-key=<key>          - Key in seed file (defaults to table name)
  --append                  - Append seed data instead of replacing

Examples:
  npx tsx drizzle-rebuild.ts rebuild accounts --seed=2-users.json --seed-key=accounts
  npx tsx drizzle-rebuild.ts rebuild customers --seed=1-customers.json
  npx tsx drizzle-rebuild.ts create accounts
  npx tsx drizzle-rebuild.ts seed users --seed=2-users.json
  npx tsx drizzle-rebuild.ts seed users --seed=2-users.json --append
  npx tsx drizzle-rebuild.ts drop accounts
  tsx drizzle-rebuild.ts seed users --seed=2-users.json
  tsx drizzle-rebuild.ts seed users --seed=2-users.json --append
  tsx drizzle-rebuild.ts drop accounts
      `);
      return;
    }
    
    const seedFile = args.find(arg => arg.startsWith('--seed-file='))?.split('=')[1] || 
                     args.find(arg => arg.startsWith('--seed='))?.split('=')[1];
    const seedKey = args.find(arg => arg.startsWith('--seed-key='))?.split('=')[1];
    const appendMode = args.includes('--append');
    
    const options = {
      tableName,
      seedFile,
      seedKey,
      appendMode,
      skipSeed: command === 'create',
      dropOnly: command === 'drop',
      createOnly: command === 'create',
      seedOnly: command === 'seed'
    };
    
    await rebuildTable(options);
    
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Run if called directly
main();
