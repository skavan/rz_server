import { db } from './src/db/index.js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

async function fixMigrationState() {
  try {
    console.log('🔧 Setting up Drizzle migration tracking...\n');
    
    // Step 1: Create the migration tracking table
    console.log('1️⃣ Creating __drizzle_migrations table...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    console.log('✅ Migration tracking table created\n');
    
    // Step 2: Read the initial migration file to get its hash
    console.log('2️⃣ Reading initial migration file...');
    const initialMigrationPath = '../drizzle/shared/drizzle/0000_absent_night_thrasher.sql';
    const initialMigrationContent = readFileSync(initialMigrationPath, 'utf-8');
    const initialMigrationHash = createHash('sha256').update(initialMigrationContent).digest('hex');
    
    console.log('Initial migration hash:', initialMigrationHash);
    
    // Step 3: Mark the initial migration as applied (since tables already exist)
    console.log('3️⃣ Marking initial migration as already applied...');
    
    // First check if this hash already exists
    const existingMigration = await db.execute(`
      SELECT id FROM "__drizzle_migrations" WHERE hash = '${initialMigrationHash}'
    `);
    
    if (existingMigration.rows.length === 0) {
      await db.execute(`
        INSERT INTO "__drizzle_migrations" (hash, created_at) 
        VALUES ('${initialMigrationHash}', ${Date.now()})
      `);
      console.log('✅ Initial migration marked as applied');
    } else {
      console.log('ℹ️ Initial migration already marked as applied');
    }
    
    console.log('✅ Initial migration marked as applied\n');
    
    // Step 4: Check current state
    console.log('4️⃣ Checking migration state...');
    const appliedMigrations = await db.execute(`
      SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at
    `);
    
    console.log('Applied migrations:');
    console.table(appliedMigrations.rows);
    
    console.log('\n🎉 Migration tracking is now set up!');
    console.log('💡 Now you can safely run: npx drizzle-kit migrate');
    console.log('   This will only apply the new migration (0001_strange_revanche.sql)');
    
  } catch (error) {
    console.error('❌ Error setting up migration state:', error);
  }
  
  process.exit(0);
}

fixMigrationState();